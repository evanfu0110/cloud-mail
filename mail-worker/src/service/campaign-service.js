import orm from '../entity/orm';
import sendLog from '../entity/send-log';
import { account } from '../entity/account';
import { targetUser } from '../entity/target-user';
import { and, eq, notExists, sql } from 'drizzle-orm';
import emailService from './email-service';
import BizError from '../error/biz-error';

const campaignService = {

    /**
     * 获取当前用户下，号池账号和目标用户的组合总数（支持重复发送则为笛卡尔积，否则排除已发送）。
     */
    async getAvailablePairs(c, userId, allowRepeat = false, targetUserIds = []) {
        const db = orm(c);
        const repeatFilter = allowRepeat ? sql`1=1` : sql`NOT EXISTS (
				  SELECT 1 FROM send_log s 
				  WHERE s.account_id = a.account_id 
				    AND s.target_user_id = t.target_user_id
			  )`;

        const targetIdsFilter = targetUserIds.length > 0
            ? sql`AND t.target_user_id IN (${sql.raw(targetUserIds.join(','))})`
            : sql``;

        const query = sql`
			SELECT count(*) as count
			FROM account a, target_user t
			WHERE a.user_id = ${userId} 
			  AND a.is_pool = 1 
			  AND a.is_del = 0
			  AND t.user_id = ${userId}
			  ${targetIdsFilter}
			  AND ${repeatFilter}
		`;
        const result = await db.all(query);
        return { count: result[0]?.count || 0 };
    },

    /**
     * 执行一批发送任务
     */
    async sendBatch(c, params, userId) {
        const { subject, content, batchSize = 10, allowRepeat = false, targetUserIds = [], repeatCount = 1 } = params;
        const db = orm(c);

        const repeatFilter = allowRepeat ? sql`1=1` : sql`NOT EXISTS (
				  SELECT 1 FROM send_log s 
				  WHERE s.account_id = a.account_id 
				    AND s.target_user_id = t.target_user_id
			  )`;

        const targetIdsFilter = targetUserIds.length > 0
            ? sql`AND t.target_user_id IN (${sql.raw(targetUserIds.join(','))})`
            : sql``;

        // 获取一批待发的对子
        const pairs = await db.all(sql`
			SELECT a.account_id, a.email as from_email, t.target_user_id, t.email as to_email
			FROM account a, target_user t
			WHERE a.user_id = ${userId} 
			  AND a.is_pool = 1 
			  AND a.is_del = 0
			  AND t.user_id = ${userId}
			  ${targetIdsFilter}
			  AND ${repeatFilter}
			LIMIT ${batchSize}
		`);

        if (pairs.length === 0) {
            return { sent: 0, status: 'finished' };
        }

        let sentCount = 0;
        for (const pair of pairs) {
            // 对每个目标发送 repeatCount 次
            for (let i = 0; i < Number(repeatCount); i++) {
                try {
                    await emailService.send(c, {
                        accountId: pair.account_id,
                        name: 'Pool Service',
                        receiveEmail: [pair.to_email],
                        subject: subject,
                        content: content,
                        attachments: []
                    }, userId);

                    // 记录日志
                    await db.insert(sendLog).values({
                        accountId: pair.account_id,
                        targetUserId: pair.target_user_id,
                        userId: userId,
                        status: 0
                    }).run();
                    sentCount++;
                } catch (err) {
                    console.error(`Send failed for ${pair.from_email} -> ${pair.to_email}`, err);
                    await db.insert(sendLog).values({
                        accountId: pair.account_id,
                        targetUserId: pair.target_user_id,
                        userId: userId,
                        status: 1,
                        error: err.message
                    }).run();
                }
            }
        }

        return { sent: sentCount, status: 'processing' };
    },

    async listLogs(c, userId) {
        const db = orm(c);
        // 查询最近的 50 条日志，关联账号和目标
        const logs = await db.all(sql`
			SELECT s.send_log_id, s.create_time, s.status, s.error,
			       a.email as from_email, t.email as to_email
			FROM send_log s
			JOIN account a ON s.account_id = a.account_id
			JOIN target_user t ON s.target_user_id = t.target_user_id
			WHERE s.user_id = ${userId}
			ORDER BY s.send_log_id DESC
			LIMIT 50
		`);
        return logs;
    }
};

export default campaignService;

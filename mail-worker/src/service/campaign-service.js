import orm from '../entity/orm';
import sendLog from '../entity/send-log';
import { sql } from 'drizzle-orm';
import emailService from './email-service';
import BizError from '../error/biz-error';

const campaignService = {

    /**
     * 获取还未发送的目标用户数量
     */
    async getAvailableTargets(c, userId, accountId, targetUserIds = []) {
        const db = orm(c);

        const targetIdsFilter = targetUserIds.length > 0
            ? sql`AND t.target_user_id IN (${sql.raw(targetUserIds.join(','))})`
            : sql``;

        // 统计还没发送过的目标
        const query = sql`
            SELECT COUNT(*) as count
            FROM target_user t
            WHERE t.user_id = ${userId}
              ${targetIdsFilter}
              AND NOT EXISTS (
                  SELECT 1 FROM send_log s
                  WHERE s.target_user_id = t.target_user_id
                    AND s.account_id = ${accountId}
                    AND s.user_id = ${userId}
              )
        `;
        const result = await db.all(query);
        return { count: result[0]?.count || 0 };
    },

    /**
     * 执行群发任务（支持数据库账号和阿里云地址）
     */
    async sendBatch(c, params, userId) {
        const { accountId, fromAddress, senderName, subject, content, batchSize = 10, targetUserIds = [] } = params;
        const db = orm(c);

        // 验证：必须提供 accountId 或 fromAddress 之一
        if (!accountId && !fromAddress) {
            throw new BizError('请选择发件账号或阿里云地址');
        }

        // 用于日志记录的标识（accountId 或特殊值）
        const logAccountId = accountId || -1; // 阿里云使用 -1 作为占位符

        const targetIdsFilter = targetUserIds.length > 0
            ? sql`AND t.target_user_id IN (${sql.raw(targetUserIds.join(','))})`
            : sql``;

        // 获取一批还没发送过的目标
        const targets = await db.all(sql`
            SELECT t.target_user_id, t.email as to_email
            FROM target_user t
            WHERE t.user_id = ${userId}
              ${targetIdsFilter}
              AND NOT EXISTS (
                  SELECT 1 FROM send_log s
                  WHERE s.target_user_id = t.target_user_id
                    AND s.account_id = ${logAccountId}
                    AND s.user_id = ${userId}
              )
            LIMIT ${batchSize}
        `);

        if (targets.length === 0) {
            return { sent: 0, status: 'finished' };
        }

        let sentCount = 0;
        for (const target of targets) {
            try {
                // 判断使用哪种发送方式
                if (fromAddress) {
                    // 使用阿里云发送
                    await this.sendViaAliyun(c, {
                        fromAddress,
                        toAddress: target.to_email,
                        subject,
                        htmlBody: content,
                        fromAlias: senderName || 'Campaign'
                    });
                } else {
                    // 使用 Resend 发送（通过 emailService）
                    await emailService.send(c, {
                        accountId: accountId,
                        name: senderName || 'Campaign',
                        receiveEmail: [target.to_email],
                        subject: subject,
                        content: content,
                        attachments: []
                    }, userId);
                }

                await db.insert(sendLog).values({
                    accountId: logAccountId,
                    targetUserId: target.target_user_id,
                    userId: userId,
                    status: 0
                }).run();
                sentCount++;
            } catch (err) {
                console.error(`Send failed to ${target.to_email}`, err);
                await db.insert(sendLog).values({
                    accountId: logAccountId,
                    targetUserId: target.target_user_id,
                    userId: userId,
                    status: 1,
                    error: err.message
                }).run();
            }
        }

        return { sent: sentCount, status: 'processing' };
    },

    /**
     * 通过阿里云发送邮件
     */
    async sendViaAliyun(c, params) {
        const settingService = await import('./setting-service.js').then(m => m.default);
        const aliyunEmailService = await import('./aliyun-email-service.js').then(m => m.default);

        const settings = await settingService.query(c);
        const aliyunConfig = JSON.parse(settings.aliyunConfig || '{}');

        if (!aliyunConfig.accessKeyId || !aliyunConfig.accessKeySecret) {
            throw new BizError('阿里云配置未完成，请先在设置页面配置');
        }

        const config = {
            accessKeyId: aliyunConfig.accessKeyId,
            accessKeySecret: aliyunConfig.accessKeySecret,
            region: aliyunConfig.region || 'cn-hangzhou',
            fromAddress: params.fromAddress
        };

        return await aliyunEmailService.send(config, params);
    },

    async listLogs(c, userId) {
        const db = orm(c);
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

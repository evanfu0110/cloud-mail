import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, sql, ne } from 'drizzle-orm';
import { accountConst, isDel, settingConst } from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';

const accountService = {

	async add(c, params, userId) {

		const { addEmailVerify, addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		let { email, token } = params;


		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}


		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix }));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelAccount'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.email !== c.env.admin) {

			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId)
				if (userAccountCount >= roleRow.accountCount) throw new BizError(t('accountLimit'), 403);
			}

			if (!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'), 403)
			}

		}

		let addVerifyOpen = false

		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true
			await turnstileService.verify(c, token);
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, addVerifyCount);
			if (addVerifyOpen) {
				await turnstileService.verify(c, token)
			}
		}


		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= addVerifyCount
		}

		accountRow.addVerifyOpen = addVerifyOpen
		return accountRow;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${email}`).get();
	},

	list(c, params, userId) {

		let { accountId, size } = params;

		accountId = Number(accountId);
		size = Number(size);

		if (size > 30) {
			size = 30;
		}

		if (!accountId) {
			accountId = 0;
		}
		return orm(c).select().from(account).where(
			and(
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL),
				gt(account.accountId, accountId)))
			.orderBy(asc(account.accountId))
			.limit(size)
			.all();
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);

		if (accountRow.email === user.email) {
			throw new BizError(t('delMyAccount'));
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError(t('noUserAccount'));
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountId)))
			.run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		await orm(c).insert(account).values({ ...params }).run();
	},

	async insertList(c, list) {
		await orm(c).insert(account).values(list).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId, userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId)
		return result;
	},

	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({ num: count() }).from(account).where(and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({ isDel: isDel.NORMAL }).where(eq(account.email, email)).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({ isDel: isDel.NORMAL }).where(eq(account.userId, userId)).run();
	},

	async setName(c, params, userId) {
		const { name, accountId } = params
		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await orm(c).update(account).set({ name }).where(and(eq(account.userId, userId), eq(account.accountId, accountId))).run();
	},

	async allAccount(c, params) {

		let { userId, num, size } = params

		userId = Number(userId)

		num = Number(num)
		size = Number(size)

		if (size > 30) {
			size = 30;
		}

		num = (num - 1) * size;

		const userRow = await userService.selectByIdIncludeDel(c, userId);

		const list = await orm(c).select().from(account).where(and(eq(account.userId, userId), ne(account.email, userRow.email))).limit(size).offset(num);
		const { total } = await orm(c).select({ total: count() }).from(account).where(eq(account.userId, userId)).get();

		return { list, total }
	},

	async physicsDelete(c, params) {
		const { accountId } = params
		await emailService.physicsDeleteByAccountId(c, accountId)
		await orm(c).delete(account).where(eq(account.accountId, accountId)).run();
	},

	async setAllReceive(c, params, userId) {
		let a = null
		const { accountId } = params;
		const accountRow = await this.selectById(c, accountId);
		if (accountRow.userId !== userId) {
			return;
		}
		await orm(c).update(account).set({ allReceive: accountConst.allReceive.CLOSE }).where(eq(account.userId, userId)).run();
		await orm(c).update(account).set({ allReceive: accountRow.allReceive ? 0 : 1 }).where(eq(account.accountId, accountId)).run();
	},

	async poolList(c, params, userId) {
		let { num, size } = params;
		num = Number(num);
		size = Number(size);
		if (size > 100) size = 100;
		const offset = (num - 1) * size;
		const list = await orm(c).select().from(account).where(and(eq(account.userId, userId), eq(account.isPool, 1), eq(account.isDel, isDel.NORMAL))).limit(size).offset(offset).all();
		const { total } = await orm(c).select({ total: count() }).from(account).where(and(eq(account.userId, userId), eq(account.isPool, 1), eq(account.isDel, isDel.NORMAL))).get();
		return { list, total };
	},

	async deletePool(c, params, userId) {
		const { accountIds } = params;
		const idList = accountIds.split(',').map(Number);
		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(and(eq(account.userId, userId), inArray(account.accountId, idList), eq(account.isPool, 1))).run();
	},

	async clearPool(c, userId) {
		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(and(eq(account.userId, userId), eq(account.isPool, 1))).run();
	},

	async batchGenerate(c, params, userId) {
		let { prefix, length, count: genCount, domain } = params;
		const { minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		// 确保参数为数字
		genCount = Number(genCount);
		length = Number(length);

		if (genCount > 1000) throw new BizError(t('batchLimit')); // 提升限制到 1000

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.email !== c.env.admin) {
			if (roleRow.accountCount > 0) {
				const userAccountCount = await this.countUserAccount(c, userId);
				if (userAccountCount + genCount > roleRow.accountCount) throw new BizError(t('accountLimit'));
			}
			if (!roleService.hasAvailDomainPerm(roleRow.availDomain, `@${domain}`)) {
				throw new BizError(t('noDomainPermAdd'));
			}
		}

		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		const accountEmails = [];

		for (let i = 0; i < genCount; i++) {
			let randomStr = '';
			for (let j = 0; j < length; j++) {
				randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
			}
			const emailName = (prefix || '') + randomStr;
			const email = `${emailName}@${domain}`;

			// 如果生成的长度小于系统要求的最小长度，则跳过
			if (emailName.length < minEmailPrefix) continue;
			// 过滤逻辑
			if (emailPrefixFilter && emailPrefixFilter.some(content => emailName.includes(content))) continue;

			accountEmails.push({
				email: email,
				userId: userId,
				name: emailName,
				isPool: 1
			});
		}

		// 分片插入 D1，防止单次请求过载
		const chunkSize = 100;
		for (let i = 0; i < accountEmails.length; i += chunkSize) {
			const chunk = accountEmails.slice(i, i + chunkSize);
			await orm(c).insert(account).values(chunk).run();
		}

		return { count: accountEmails.length };
	}
};

export default accountService;

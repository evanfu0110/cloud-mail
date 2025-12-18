import app from '../hono/hono';
import campaignService from '../service/campaign-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/campaign/stats', async (c) => {
    const { allowRepeat, targetUserIds } = c.req.query();
    const ids = targetUserIds ? targetUserIds.split(',').map(Number) : [];
    const data = await campaignService.getAvailablePairs(c, userContext.getUserId(c), allowRepeat === 'true', ids);
    return c.json(result.ok(data));
});

app.post('/campaign/send', async (c) => {
    const params = await c.req.json();
    const data = await campaignService.sendBatch(c, params, userContext.getUserId(c));
    return c.json(result.ok(data));
});

app.get('/campaign/logs', async (c) => {
    const data = await campaignService.listLogs(c, userContext.getUserId(c));
    return c.json(result.ok(data));
});

// [临时修复] 用于远程环境删除唯一索引
app.get('/campaign/fix-unique-index', async (c) => {
    try {
        await c.env.db.prepare("DROP INDEX IF EXISTS unique_account_target").run();
        return c.json(result.ok("SUCCESS: Unique index dropped. You can now send repeat emails."));
    } catch (e) {
        return c.json(result.error("FAILED: " + e.message));
    }
});

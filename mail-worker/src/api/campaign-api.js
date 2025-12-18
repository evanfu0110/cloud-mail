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

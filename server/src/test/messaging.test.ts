import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, foodOrder, setupTestApp } from './helpers';

let t: ReturnType<typeof setupTestApp>;
let ctx: Awaited<ReturnType<typeof bootstrap>>;

beforeEach(async () => {
  t = setupTestApp();
  ctx = await bootstrap(t);
});

describe('messaging', () => {
  it('routes a customer message to the organizer and the reply back', async () => {
    const direct = await ctx.parent.post('/api/threads/direct').send({});
    await ctx.parent.post(`/api/threads/${direct.body.id}/messages`).send({ body: 'Can you do Saturday?' });
    await t.flush();
    expect(t.sent.some((s) => s.to === '+17195550100' && s.body.includes('Can you do Saturday?'))).toBe(true);

    const inbox = await ctx.org.get('/api/threads');
    const thread = inbox.body.find((x: { id: number }) => x.id === direct.body.id);
    expect(thread.unread).toBe(1);
    await ctx.org.get(`/api/threads/${direct.body.id}`);
    expect((await ctx.org.get('/api/threads')).body.find((x: { id: number }) => x.id === direct.body.id).unread).toBe(0);

    t.sent.length = 0;
    await ctx.org.post(`/api/threads/${direct.body.id}/messages`).send({ body: 'Yes — 1800 works.' });
    await t.flush();
    expect(t.sent.some((s) => s.to === '+17195550102' && s.body.includes('1800 works'))).toBe(true);
  });

  it('does not let other customers read a conversation', async () => {
    const direct = await ctx.parent.post('/api/threads/direct').send({});
    expect((await ctx.cadet.get(`/api/threads/${direct.body.id}`)).status).toBe(403);
  });

  it('files inbound texts into the sender’s active order thread', async () => {
    const settings = (await ctx.org.get('/api/admin/settings')).body;
    await ctx.org.put('/api/admin/settings/providers').send({
      email: settings.providers.email,
      sms: { enabled: true, accountSid: 'AC123', authToken: 'secret-token', fromNumber: '+17195559999', messagingServiceSid: '' },
    });
    await ctx.org.put('/api/admin/settings/profile').send({ ...settings.profile, siteUrl: 'https://delivery.example.com' });
    const order = await ctx.parent.post('/api/orders').send(foodOrder(ctx));

    const params = { From: '+17195550102', Body: 'Running 5 min late!' };
    const url = 'https://delivery.example.com/api/webhooks/sms';
    const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k as keyof typeof params], url);
    const sig = crypto.createHmac('sha1', 'secret-token').update(data).digest('base64');

    const bad = await ctx.org.raw.post('/api/webhooks/sms').type('form').send(params).set('x-twilio-signature', 'nope');
    expect(bad.status).toBe(403);
    const ok = await ctx.org.raw.post('/api/webhooks/sms').type('form').send(params).set('x-twilio-signature', sig);
    expect(ok.status).toBe(200);

    const thread = await ctx.org.get(`/api/threads/${order.body.threadId}`);
    expect(thread.body.messages[0]).toMatchObject({ body: 'Running 5 min late!', via: 'sms' });
  });

  it('posts announcements and texts them when asked', async () => {
    const res = await ctx.org.post('/api/announcements').send({ title: 'Chick-fil-A run Tuesday', body: 'Order by Monday 2000.', audience: 'everyone', sendSms: true });
    expect(res.status).toBe(201);
    expect(res.body.delivery.sms).toBe(2);
    const feed = await ctx.cadet.get('/api/announcements');
    expect(feed.body[0].title).toBe('Chick-fil-A run Tuesday');
  });
});

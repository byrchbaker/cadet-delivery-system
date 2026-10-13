import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, foodOrder, setupTestApp, type Agent } from './helpers';

let t: ReturnType<typeof setupTestApp>;
let ctx: Awaited<ReturnType<typeof bootstrap>>;

async function apply(name: string, email: string): Promise<{ agent: Agent; id: number }> {
  const agent = t.agent();
  const res = await agent.post('/api/auth/register').send({
    role: 'helper', firstName: name, lastName: 'Helper', email, phone: '7195550200', password: 'helper-password', note: 'I drive on weekends',
  });
  expect(res.status).toBe(201);
  return { agent, id: res.body.user.id };
}

beforeEach(async () => {
  t = setupTestApp();
  ctx = await bootstrap(t);
});

describe('helpers', () => {
  it('holds new applicants until the organizer approves them', async () => {
    const h = await apply('Hank', 'hank@example.com');
    const me = await h.agent.get('/api/auth/me');
    expect(me.body.user.status).toBe('pending');
    expect((await h.agent.get('/api/orders')).status).toBe(403);

    const notes = await ctx.org.get('/api/me/notifications');
    expect(notes.body[0].event).toBe('helper_application');

    const team = await ctx.org.get('/api/admin/team');
    const pending = team.body.members.find((m: { id: number }) => m.id === h.id);
    expect(pending.status).toBe('pending');
    expect(pending.applicationNote).toBe('I drive on weekends');

    const approved = await ctx.org.post(`/api/admin/team/${h.id}/approve`).send({ permissions: ['deliver', 'claim'] });
    expect(approved.body.user.status).toBe('active');
    expect((await h.agent.get('/api/orders')).status).toBe(200);
  });

  it('stops non-organizers from approving helpers', async () => {
    const h = await apply('Hank', 'hank@example.com');
    expect((await ctx.parent.post(`/api/admin/team/${h.id}/approve`).send({})).status).toBe(403);
  });

  it('lets a delivery helper claim and run an order but not dispatch', async () => {
    const h = await apply('Hank', 'hank@example.com');
    await ctx.org.post(`/api/admin/team/${h.id}/approve`).send({ permissions: ['deliver', 'claim'] });

    const requested = await ctx.parent.post('/api/orders').send(foodOrder(ctx));
    const id = requested.body.id;
    // Requested (unconfirmed) orders are not visible to claim-only helpers.
    expect((await h.agent.get(`/api/orders/${id}`)).status).toBe(404);
    expect((await h.agent.post(`/api/orders/${id}/status`).send({ status: 'confirmed' })).status).toBe(404);

    await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'confirmed' });
    const claimable = await h.agent.get(`/api/orders/${id}`);
    expect(claimable.body.can.claim).toBe(true);
    expect(claimable.body.can.manage).toBe(false);

    const claimed = await h.agent.post(`/api/orders/${id}/claim`).send({});
    expect(claimed.body.assignedTo.id).toBe(h.id);

    await t.flush();
    t.sent.length = 0;
    const moving = await h.agent.post(`/api/orders/${id}/status`).send({ status: 'en_route', etaMinutes: 20 });
    expect(moving.status).toBe(200);
    await t.flush();
    expect(t.sent.some((s) => s.body.includes('On the way'))).toBe(true);

    // A second helper cannot touch it.
    const h2 = await apply('Gina', 'gina@example.com');
    await ctx.org.post(`/api/admin/team/${h2.id}/approve`).send({ permissions: ['deliver', 'claim'] });
    expect((await h2.agent.get(`/api/orders/${id}`)).status).toBe(404);
    expect((await h2.agent.post(`/api/orders/${id}/status`).send({ status: 'delivered' })).status).toBe(404);
  });

  it('notifies a helper when dispatch assigns them an order', async () => {
    const h = await apply('Hank', 'hank@example.com');
    await ctx.org.post(`/api/admin/team/${h.id}/approve`).send({ permissions: ['deliver'] });
    const o = await ctx.parent.post('/api/orders').send(foodOrder(ctx));
    await ctx.org.post(`/api/orders/${o.body.id}/status`).send({ status: 'confirmed' });
    const assigned = await ctx.org.patch(`/api/orders/${o.body.id}`).send({ assignedTo: h.id });
    expect(assigned.body.assignedTo.id).toBe(h.id);
    await t.flush();
    expect(t.sent.some((s) => s.to === '+17195550200' && s.body.startsWith('Assigned to you'))).toBe(true);
    const sheet = await h.agent.get(`/api/staff/run-sheet?date=${o.body.serviceDate}`);
    expect(sheet.body.map((x: { id: number }) => x.id)).toEqual([o.body.id]);
  });

  it('pre-approves helpers who join through an organizer invite', async () => {
    const inv = await ctx.org.post('/api/admin/team/invite').send({ permissions: ['deliver', 'inbox'] });
    const agent = t.agent();
    const res = await agent.post('/api/auth/register').send({
      role: 'helper', firstName: 'Ivy', lastName: 'Invited', email: 'ivy@example.com', phone: '7195550300', password: 'ivy-password', invite: inv.body.code,
    });
    expect(res.body.user.status).toBe('active');
    expect(res.body.user.permissions.sort()).toEqual(['deliver', 'inbox']);
    // Single use
    const again = await t.agent().post('/api/auth/register').send({
      role: 'helper', firstName: 'X', lastName: 'Y', email: 'xy@example.com', phone: '7195550301', password: 'xy-password', invite: inv.body.code,
    });
    expect(again.status).toBe(400);
  });

  it('keeps at least one organizer', async () => {
    const res = await ctx.org.patch(`/api/admin/team/${ctx.orgId}`).send({ role: 'helper' });
    expect(res.status).toBe(409);
  });
});

describe('helper permission edges', () => {
  it('lets a claim-only helper open the run sheet and see claimable orders', async () => {
    const h = await apply('Cleo', 'cleo@example.com');
    await ctx.org.post(`/api/admin/team/${h.id}/approve`).send({ permissions: ['claim'] });
    const o = await ctx.parent.post('/api/orders').send(foodOrder(ctx));
    await ctx.org.post(`/api/orders/${o.body.id}/status`).send({ status: 'confirmed' });
    const sheet = await h.agent.get(`/api/staff/run-sheet?date=${o.body.serviceDate}`);
    expect(sheet.status).toBe(200);
    expect(sheet.body.map((x: { id: number }) => x.id)).toContain(o.body.id);
  });

  it('keeps the customer directory from helpers without people or dispatch access', async () => {
    const h = await apply('Dee', 'dee@example.com');
    await ctx.org.post(`/api/admin/team/${h.id}/approve`).send({ permissions: ['deliver'] });
    expect((await h.agent.get('/api/staff/people')).status).toBe(403);
    await ctx.org.patch(`/api/admin/team/${h.id}`).send({ permissions: ['deliver', 'dispatch'] });
    expect((await h.agent.get('/api/staff/people')).status).toBe(200);
  });
});

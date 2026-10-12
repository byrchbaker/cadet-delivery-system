import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, foodOrder, futureDate, setupTestApp } from './helpers';

let t: ReturnType<typeof setupTestApp>;
let ctx: Awaited<ReturnType<typeof bootstrap>>;

beforeEach(async () => {
  t = setupTestApp();
  ctx = await bootstrap(t);
});

describe('setup & accounts', () => {
  it('runs first-time setup only once and loads starter content when asked', async () => {
    const again = await t.agent().post('/api/setup').send({
      businessName: 'X', firstName: 'A', lastName: 'B', email: 'x@example.com', phone: '', password: 'password1', starter: {},
    });
    expect(again.status).toBe(409);
    expect(ctx.services.length).toBeGreaterThan(5);
    const info = await t.agent().get('/api/public/info');
    expect(info.body.needsSetup).toBe(false);
    expect(info.body.profile.businessName).toBe('Test Delivery Co');
    expect(info.body.lists.squadrons).toContain('CS-12');
  });

  it('links a parent to a cadet through an invite code', async () => {
    const fam = await ctx.parent.get('/api/family');
    expect(fam.body.cadets.map((c: { id: number }) => c.id)).toEqual([ctx.cadetId]);
    const famC = await ctx.cadet.get('/api/family');
    expect(famC.body.parents[0].firstName).toBe('Pat');
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const res = await ctx.parent.raw.post('/api/orders').send(foodOrder(ctx));
    expect(res.status).toBe(403);
  });

  it('lets a parent add a cadet who has not signed up, then the cadet claims the profile', async () => {
    const created = await ctx.parent.post('/api/family/cadets').send({ firstName: 'Sam', lastName: 'Jones', phone: '7195550109', classYear: '2029' });
    expect(created.status).toBe(201);
    expect(created.body.cadet.managed).toBe(true);
    const inv = await ctx.parent.post('/api/family/invite').send({ forCadetId: created.body.cadet.id });
    const lookup = await t.agent().get(`/api/invites/${inv.body.code}`);
    expect(lookup.body.prefill.firstName).toBe('Sam');
    const reg = await t.agent().post('/api/auth/register').send({
      role: 'cadet', firstName: 'Sam', lastName: 'Jones', email: 'sam@example.com', phone: '7195550109', password: 'sam-password', invite: inv.body.code,
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.id).toBe(created.body.cadet.id);
    expect(reg.body.user.managed).toBe(false);
  });
});

describe('order lifecycle', () => {
  it('runs request → confirm → en route → delivered and notifies the right people', async () => {
    const created = await ctx.parent.post('/api/orders').send(foodOrder(ctx));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('requested');
    const id = created.body.id;

    await t.flush();
    expect(t.sent.some((s) => s.channel === 'sms' && s.to === '+17195550100' && s.body.includes('New request'))).toBe(true);

    // Cadet sees it
    const cadetList = await ctx.cadet.get('/api/orders?scope=active');
    expect(cadetList.body.map((o: { id: number }) => o.id)).toContain(id);

    const confirm = await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'confirmed' });
    expect(confirm.body.status).toBe('confirmed');

    t.sent.length = 0;
    const enRoute = await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'en_route', etaMinutes: 15 });
    expect(enRoute.body.status).toBe('en_route');
    expect(enRoute.body.etaAt).toBeTruthy();
    await t.flush();
    const etaTexts = t.sent.filter((s) => s.channel === 'sms' && s.body.startsWith('On the way'));
    expect(etaTexts.map((s) => s.to).sort()).toEqual(['+17195550101', '+17195550102']);
    expect(etaTexts[0].body).toContain('/t/');

    const delivered = await ctx.org.post(`/api/orders/${id}/deliver`).field('note', 'Top shelf').attach('photo', Buffer.from('fakepng'), {
      filename: 'shelf.png',
      contentType: 'image/png',
    });
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe('delivered');
    expect(delivered.body.attachments[0].kind).toBe('delivery');

    const track = await t.agent().get(`/api/public/track/${delivered.body.trackingToken}`);
    expect(track.body.status).toBe('delivered');
    expect(track.body.hasPhoto).toBe(true);
    const photo = await t.agent().get(`/api/public/track/${delivered.body.trackingToken}/photo`);
    expect(photo.status).toBe(200);
  });

  it('validates required fields for the service category', async () => {
    const res = await ctx.parent.post('/api/orders').send(foodOrder(ctx, { details: { vendor: 'Chipotle' } }));
    expect(res.status).toBe(400);
    expect(res.body.fields['details.orderName']).toBeTruthy();
  });

  it('flags short-notice orders and blocks blackout dates', async () => {
    const soon = await ctx.parent.post('/api/orders').send(foodOrder(ctx, { serviceDate: futureDate(0), time: '23:59' }));
    // Either today 23:59 is still ahead (short notice) or already past (rejected).
    if (soon.status === 201) expect(soon.body.shortNotice).toBe(true);
    else expect(soon.status).toBe(400);

    const settings = (await ctx.org.get('/api/admin/settings')).body;
    await ctx.org.put('/api/admin/settings/scheduling').send({ ...settings.scheduling, blackouts: [{ date: futureDate(5), reason: 'Holiday weekend' }] });
    const blocked = await ctx.parent.post('/api/orders').send(foodOrder(ctx, { serviceDate: futureDate(5) }));
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toContain('Holiday weekend');
  });

  it('lets a parent propose an order the cadet must accept', async () => {
    const created = await ctx.parent.post('/api/orders').send(foodOrder(ctx, { askCadet: true }));
    expect(created.body.status).toBe('proposed');
    expect(created.body.can.pay).toBe(false);
    const asCadet = await ctx.cadet.get(`/api/orders/${created.body.id}`);
    expect(asCadet.body.can.respond).toBe(true);
    const accepted = await ctx.cadet.post(`/api/orders/${created.body.id}/respond`).send({ accept: true, note: 'Thanks!' });
    expect(accepted.body.status).toBe('requested');
    const notes = await ctx.parent.get('/api/me/notifications');
    expect(notes.body.some((n: { event: string }) => n.event === 'proposal_accepted')).toBe(true);
  });

  it('lets a cadet ask family to pay, and the payment be reported and verified', async () => {
    const created = await ctx.cadet.post('/api/orders').send(foodOrder(ctx, { payer: 'family', payerId: ctx.parentId }));
    expect(created.status).toBe(201);
    const id = created.body.id;
    const asParent = await ctx.parent.get(`/api/orders/${id}`);
    expect(asParent.body.can.pay).toBe(true);
    const parentNotes = await ctx.parent.get('/api/me/notifications');
    expect(parentNotes.body[0].event).toBe('payment_requested');

    const reported = await ctx.parent.post(`/api/orders/${id}/payment/report`).send({ method: 'Venmo', reference: '@pat' });
    expect(reported.body.paymentStatus).toBe('reported');
    const paid = await ctx.org.post(`/api/orders/${id}/payment`).send({ status: 'paid' });
    expect(paid.body.paymentStatus).toBe('paid');
  });

  it('marks orders covered when the cadet has an active subscription', async () => {
    await ctx.org.post('/api/staff/subscriptions').send({ cadetId: ctx.cadetId, label: 'Fall semester', startsOn: futureDate(-10), endsOn: futureDate(60) });
    const created = await ctx.parent.post('/api/orders').send(foodOrder(ctx));
    expect(created.body.paymentStatus).toBe('covered');
  });
});

describe('surprises', () => {
  it('keeps hidden surprises invisible to the cadet until delivered', async () => {
    const created = await ctx.parent.post('/api/orders').send({
      serviceId: ctx.birthday.id,
      cadetId: ctx.cadetId,
      serviceDate: futureDate(),
      time: '18:00',
      locationId: ctx.locationId,
      details: { vendor: 'Nothing Bundt Cakes', orderName: 'CADET JONES', items: 'Lemon cake' },
      surprise: 'hidden',
    });
    const id = created.body.id;
    expect((await ctx.cadet.get('/api/orders')).body).toHaveLength(0);
    expect((await ctx.cadet.get(`/api/orders/${id}`)).status).toBe(404);

    await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'confirmed' });
    await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'en_route', etaMinutes: 10 });
    await t.flush();
    expect(t.sent.some((s) => s.to === '+17195550101')).toBe(false);

    await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'delivered' });
    await t.flush();
    const surprise = t.sent.filter((s) => s.to === '+17195550101' && s.channel === 'sms');
    expect(surprise).toHaveLength(1);
    expect(surprise[0].body).toContain('Surprise');
    const visible = await ctx.cadet.get(`/api/orders/${id}`);
    expect(visible.body.serviceName).toBe(ctx.birthday.name);
    expect(visible.body.redacted).toBe(false);
  });

  it('gives heads-up surprises a when/where preview without contents', async () => {
    const created = await ctx.parent.post('/api/orders').send({
      serviceId: ctx.birthday.id,
      cadetId: ctx.cadetId,
      serviceDate: futureDate(),
      time: '18:00',
      locationId: ctx.locationId,
      details: { vendor: 'Crumbl', orderName: 'CADET JONES', items: 'Cookies' },
      surprise: 'heads_up',
    });
    const id = created.body.id;
    await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'confirmed' });
    const seen = await ctx.cadet.get(`/api/orders/${id}`);
    expect(seen.body.redacted).toBe(true);
    expect(seen.body.serviceName).toBe('Surprise delivery');
    expect(seen.body.details).toEqual({});
    expect(seen.body.createdBy.firstName).toBe('Someone');
    expect(seen.body.threadId).toBeNull();

    t.sent.length = 0;
    await ctx.org.post(`/api/orders/${id}/status`).send({ status: 'en_route', etaMinutes: 10 });
    await t.flush();
    const cadetTexts = t.sent.filter((s) => s.to === '+17195550101');
    expect(cadetTexts).toHaveLength(1);
    expect(cadetTexts[0].body).toContain('Heads up');
    expect(cadetTexts[0].body).not.toContain('Crumbl');
  });
});

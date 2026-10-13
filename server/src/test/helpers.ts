import request from 'supertest';
import { addDays, todayIn } from '@cds/shared';
import { createApp } from '../app';
import { db, initDb } from '../db';
import { clearSettingsCache } from '../lib/settings';
import { processQueue } from '../notify';
import { setDrivers } from '../notify/providers';

export interface Sent {
  channel: 'sms' | 'email';
  to: string;
  subject?: string;
  body: string;
}

export function setupTestApp() {
  initDb(':memory:');
  clearSettingsCache();
  const sent: Sent[] = [];
  setDrivers({
    sms: async (to, body) => {
      sent.push({ channel: 'sms', to, body });
      return { ok: true };
    },
    email: async (to, subject, text) => {
      sent.push({ channel: 'email', to, subject, body: text });
      return { ok: true };
    },
  });
  const app = createApp();
  const agent = () => {
    const a = request.agent(app);
    const wrap = (method: 'get' | 'post' | 'patch' | 'put' | 'delete') => (url: string) => a[method](url).set('x-requested-with', 'cds');
    return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), delete: wrap('delete'), raw: a };
  };
  // Wait until every queued text/email has been handed to the recording drivers.
  // (processQueue returns early if a run is already in progress, so poll the table.)
  const flush = async () => {
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 10));
      await processQueue();
      const { n } = db()
        .prepare("SELECT COUNT(*) n FROM notifications WHERE status = 'pending' AND channel IN ('sms','email')")
        .get() as { n: number };
      if (n === 0) return;
    }
    throw new Error('Outbound queue did not drain');
  };
  return { app, agent, sent, flush };
}

export type Agent = ReturnType<ReturnType<typeof setupTestApp>['agent']>;

export const futureDate = (days = 3) => addDays(todayIn('America/Denver'), days);

export async function bootstrap(t: ReturnType<typeof setupTestApp>) {
  const org = t.agent();
  const setup = await org.post('/api/setup').send({
    businessName: 'Test Delivery Co',
    firstName: 'Olivia',
    lastName: 'Organizer',
    email: 'org@example.com',
    phone: '7195550100',
    password: 'organizer-pass',
    starter: { services: true, locations: true, lists: true },
  });
  if (setup.status !== 201) throw new Error(JSON.stringify(setup.body));

  const cadet = t.agent();
  const c = await cadet.post('/api/auth/register').send({
    role: 'cadet',
    firstName: 'Casey',
    lastName: 'Jones',
    email: 'casey@example.com',
    phone: '7195550101',
    password: 'cadet-password',
    cadet: { classYear: '2028', squadron: 'CS-12', dorm: 'Sijan Hall' },
  });
  if (c.status !== 201) throw new Error(JSON.stringify(c.body));
  const invite = await cadet.post('/api/family/invite').send({});

  const parent = t.agent();
  const p = await parent.post('/api/auth/register').send({
    role: 'parent',
    firstName: 'Pat',
    lastName: 'Jones',
    email: 'pat@example.com',
    phone: '7195550102',
    password: 'parent-password',
    invite: invite.body.code,
  });
  if (p.status !== 201) throw new Error(JSON.stringify(p.body));

  const services = (await org.get('/api/services')).body as { id: number; category: string; name: string; feeCents: number }[];
  const locations = (await org.get('/api/locations')).body as { id: number }[];
  return {
    org,
    cadet,
    parent,
    cadetId: c.body.user.id as number,
    parentId: p.body.user.id as number,
    orgId: setup.body.user.id as number,
    services,
    food: services.find((s) => s.name === 'Individual food order')!,
    birthday: services.find((s) => s.category === 'birthday')!,
    locationId: locations[0].id,
  };
}

export function foodOrder(ctx: Awaited<ReturnType<typeof bootstrap>>, extra: Record<string, unknown> = {}) {
  return {
    serviceId: ctx.food.id,
    cadetId: ctx.cadetId,
    serviceDate: futureDate(),
    time: '17:30',
    locationId: ctx.locationId,
    details: { vendor: 'Chipotle', orderName: 'CADET JONES', orderNumber: 'A123', items: '2 bowls' },
    ...extra,
  };
}

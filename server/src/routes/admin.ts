import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
  DEFAULT_HELPER_PERMISSIONS,
  SETTINGS_SCHEMAS,
  STATUS_LABELS,
  TEMPLATES,
  TEMPLATE_KEYS,
  addDays,
  detailSummary,
  emailSchema,
  permissionsSchema,
  todayIn,
  type SettingsSection,
  type TemplateKey,
} from '@cds/shared';
import { config } from '../config';
import { db, json } from '../db';
import { me, requireOrganizer } from '../lib/auth';
import { badRequest, conflict, intParam, notFound, parse } from '../lib/http';
import { shortCode } from '../lib/ids';
import { getSettings, getTemplateOverrides, saveSettings, saveTemplateOverrides, siteUrl, timezone } from '../lib/settings';
import { fullName, getUser, toUserDTO, type UserRow } from '../lib/users';
import { emailHtml, notify, retryNotification } from '../notify';
import { emailConfig, getDrivers, smsConfig } from '../notify/providers';
import { broadcast, publish } from '../realtime';
import { createBackup } from '../jobs';

export const adminRoutes = Router();
adminRoutes.use('/admin', requireOrganizer);

const MASK = '••••••••';

// ---------------------------------------------------------------------------
// Settings

adminRoutes.get('/admin/settings', (_req, res) => {
  const providers = getSettings('providers');
  res.json({
    profile: getSettings('profile'),
    scheduling: getSettings('scheduling'),
    payments: getSettings('payments'),
    lists: getSettings('lists'),
    appearance: getSettings('appearance'),
    registration: getSettings('registration'),
    providers: {
      email: { ...providers.email, pass: providers.email.pass ? MASK : '' },
      sms: { ...providers.sms, authToken: providers.sms.authToken ? MASK : '' },
    },
    providerStatus: {
      email: emailConfig() ? (emailConfig()!.source === 'environment' ? 'environment' : 'configured') : 'off',
      sms: smsConfig() ? (smsConfig()!.source === 'environment' ? 'environment' : 'configured') : 'off',
      inboundSmsUrl: `${siteUrl()}/api/webhooks/sms`,
    },
  });
});

adminRoutes.put('/admin/settings/:section', (req, res) => {
  const section = req.params.section as SettingsSection;
  if (!(section in SETTINGS_SCHEMAS)) throw notFound();
  let body = req.body;
  if (section === 'providers') {
    const current = getSettings('providers');
    body = {
      email: { ...body.email, pass: body.email?.pass === MASK ? current.email.pass : body.email?.pass },
      sms: { ...body.sms, authToken: body.sms?.authToken === MASK ? current.sms.authToken : body.sms?.authToken },
    };
  }
  const parsed = SETTINGS_SCHEMAS[section].safeParse(body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid settings');
  saveSettings(section, parsed.data);
  broadcast({ type: 'settings' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Message templates

adminRoutes.get('/admin/templates', (_req, res) => {
  res.json({ defaults: TEMPLATES, overrides: getTemplateOverrides() });
});

const templateInput = z.object({
  sms: z.string().max(1000).optional(),
  subject: z.string().max(300).optional(),
  email: z.string().max(5000).optional(),
  channels: z.object({ sms: z.boolean().optional(), email: z.boolean().optional() }).optional(),
});

adminRoutes.put('/admin/templates/:key', (req, res) => {
  const key = req.params.key as TemplateKey;
  if (!TEMPLATE_KEYS.includes(key)) throw notFound();
  const input = parse(templateInput, req.body);
  const overrides = { ...getTemplateOverrides(), [key]: input };
  saveTemplateOverrides(overrides);
  res.json({ ok: true });
});

adminRoutes.delete('/admin/templates/:key', (req, res) => {
  const overrides = { ...getTemplateOverrides() };
  delete overrides[req.params.key as TemplateKey];
  saveTemplateOverrides(overrides);
  res.json({ ok: true });
});

/** Send a test text or email right now and report what the provider said. */
adminRoutes.post('/admin/test-notification', async (req, res) => {
  const user = me(req);
  const input = parse(z.object({ channel: z.enum(['sms', 'email']), to: z.string().trim().max(200).optional() }), req.body);
  const business = getSettings('profile').businessName;
  if (input.channel === 'sms') {
    const to = input.to || user.phone_e164;
    if (!to) throw badRequest('Add a phone number to your profile or enter one to test.');
    const r = await getDrivers().sms(to, `${business}: test message — texts are working.`);
    res.json(r);
  } else {
    const to = input.to ? emailSchema.parse(input.to) : user.email;
    if (!to) throw badRequest('Enter an email address to test.');
    const body = 'This is a test email. If you are reading it, email notifications are working.';
    const r = await getDrivers().email(to, `${business} — test email`, body, emailHtml('Test email', body));
    res.json(r);
  }
});

// ---------------------------------------------------------------------------
// Team (organizers + helpers)

adminRoutes.get('/admin/team', (_req, res) => {
  const rows = db()
    .prepare(
      `SELECT u.*,
         (SELECT COUNT(*) FROM orders o WHERE o.assigned_to = u.id AND o.status = 'delivered') delivered_count,
         (SELECT COUNT(*) FROM orders o WHERE o.assigned_to = u.id AND o.status NOT IN ('delivered','declined','cancelled')) open_count
       FROM users u WHERE u.role IN ('organizer','helper')
       ORDER BY CASE u.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, u.role DESC, u.first_name`,
    )
    .all() as (UserRow & { delivered_count: number; open_count: number })[];
  const invites = db()
    .prepare("SELECT code, permissions, expires_at, created_at FROM invites WHERE kind = 'helper' AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC")
    .all(new Date().toISOString()) as { code: string; permissions: string; expires_at: string; created_at: string }[];
  res.json({
    members: rows.map((r) => ({ ...toUserDTO(r), applicationNote: r.note, deliveredCount: r.delivered_count, openCount: r.open_count })),
    invites: invites.map((i) => ({ code: i.code, url: `${siteUrl()}/join/${i.code}`, permissions: json(i.permissions, []), expiresAt: i.expires_at })),
  });
});

function teamMember(id: number): UserRow {
  const u = getUser(id);
  if (!u || !['organizer', 'helper'].includes(u.role)) throw notFound('Team member not found.');
  return u;
}

adminRoutes.post('/admin/team/:id/approve', (req, res) => {
  const u = teamMember(intParam(req));
  const { permissions } = parse(z.object({ permissions: permissionsSchema.default(DEFAULT_HELPER_PERMISSIONS) }), req.body ?? {});
  db().prepare("UPDATE users SET status = 'active', permissions = ? WHERE id = ?").run(JSON.stringify(permissions), u.id);
  notify({ event: 'helper_approved', to: [getUser(u.id)], vars: { name: u.first_name }, link: '/app' });
  publish([u.id, ...[me(req).id]], { type: 'team' });
  res.json({ user: toUserDTO(getUser(u.id)!) });
});

adminRoutes.patch('/admin/team/:id', (req, res) => {
  const actor = me(req);
  const u = teamMember(intParam(req));
  const input = parse(
    z.object({
      permissions: permissionsSchema.optional(),
      status: z.enum(['active', 'suspended']).optional(),
      role: z.enum(['organizer', 'helper']).optional(),
    }),
    req.body,
  );
  const demoting = (input.role === 'helper' || input.status === 'suspended') && u.role === 'organizer';
  if (demoting) {
    const others = (db().prepare("SELECT COUNT(*) n FROM users WHERE role = 'organizer' AND status = 'active' AND id != ?").get(u.id) as { n: number }).n;
    if (others === 0) throw conflict('There must always be at least one active organizer.');
  }
  if (u.id === actor.id && demoting) throw conflict("You can't remove your own organizer access. Ask another organizer.");
  db()
    .prepare('UPDATE users SET permissions = COALESCE(?, permissions), status = COALESCE(?, status), role = COALESCE(?, role) WHERE id = ?')
    .run(input.permissions ? JSON.stringify(input.permissions) : null, input.status ?? null, input.role ?? null, u.id);
  if (input.status === 'suspended') {
    db().prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    db().prepare("UPDATE orders SET assigned_to = NULL WHERE assigned_to = ? AND status IN ('confirmed')").run(u.id);
  }
  publish([u.id], { type: 'team' });
  res.json({ user: toUserDTO(getUser(u.id)!) });
});

/** Decline a pending application (removes it). */
adminRoutes.delete('/admin/team/:id', (req, res) => {
  const u = teamMember(intParam(req));
  if (u.status !== 'pending') throw conflict('Only pending applications can be removed. Deactivate active helpers instead.');
  db().prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});

adminRoutes.post('/admin/team/invite', (req, res) => {
  const { permissions } = parse(z.object({ permissions: permissionsSchema.default(DEFAULT_HELPER_PERMISSIONS) }), req.body ?? {});
  const code = shortCode(8);
  db()
    .prepare("INSERT INTO invites (code, kind, created_by, permissions, expires_at) VALUES (?, 'helper', ?, ?, ?)")
    .run(code, me(req).id, JSON.stringify(permissions), new Date(Date.now() + 14 * 86400_000).toISOString());
  res.status(201).json({ code, url: `${siteUrl()}/join/${code}` });
});

adminRoutes.delete('/admin/team/invites/:code', (req, res) => {
  db().prepare("DELETE FROM invites WHERE code = ? AND kind = 'helper'").run(req.params.code);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Outbox — every text and email the system tried to send

adminRoutes.get('/admin/outbox', (req, res) => {
  const where = ["channel IN ('sms','email')"];
  const params: Record<string, unknown> = {};
  if (typeof req.query.status === 'string' && req.query.status) {
    where.push('n.status = @status');
    params.status = req.query.status;
  }
  if (typeof req.query.channel === 'string' && ['sms', 'email'].includes(req.query.channel)) {
    where.push('n.channel = @channel');
    params.channel = req.query.channel;
  }
  const rows = db()
    .prepare(
      `SELECT n.id, n.channel, n.event, n.to_address, n.title, n.body, n.status, n.error, n.attempts, n.created_at, n.sent_at, n.order_id,
              u.first_name, u.last_name
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id
       WHERE ${where.join(' AND ')} ORDER BY n.id DESC LIMIT 300`,
    )
    .all(params);
  const stats = db()
    .prepare("SELECT channel, status, COUNT(*) n FROM notifications WHERE channel IN ('sms','email') AND created_at >= ? GROUP BY channel, status")
    .all(new Date(Date.now() - 30 * 86400_000).toISOString());
  res.json({ rows, stats });
});

adminRoutes.post('/admin/outbox/:id/retry', (req, res) => {
  if (!retryNotification(intParam(req))) throw conflict('Only failed or skipped messages can be retried.');
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Reports & exports

adminRoutes.get('/admin/reports', (req, res) => {
  const today = todayIn(timezone());
  const from = typeof req.query.from === 'string' ? req.query.from : addDays(today, -89);
  const to = typeof req.query.to === 'string' ? req.query.to : today;
  const base = "FROM orders WHERE service_date BETWEEN @from AND @to AND status NOT IN ('declined','cancelled','proposed')";
  const p = { from, to };
  const totals = db()
    .prepare(
      `SELECT COUNT(*) orders,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN fee_cents + tip_cents END), 0) collected,
         COALESCE(SUM(CASE WHEN payment_status IN ('unpaid','reported') THEN fee_cents + tip_cents END), 0) outstanding,
         COALESCE(SUM(tip_cents), 0) tips,
         COUNT(DISTINCT cadet_id) cadets,
         SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) delivered
       ${base}`,
    )
    .get(p);
  const byService = db()
    .prepare(`SELECT service_name name, category, COUNT(*) orders, COALESCE(SUM(fee_cents + tip_cents),0) revenue ${base} GROUP BY service_name ORDER BY revenue DESC`)
    .all(p);
  const byWeek = db()
    .prepare(
      `SELECT date(service_date, 'weekday 0', '-6 days') week, COUNT(*) orders,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN fee_cents + tip_cents END),0) collected,
         COALESCE(SUM(fee_cents + tip_cents),0) billed
       ${base} GROUP BY week ORDER BY week`,
    )
    .all(p);
  const byWeekday = db()
    .prepare(`SELECT CAST(strftime('%w', service_date) AS INTEGER) dow, COUNT(*) orders ${base} GROUP BY dow ORDER BY dow`)
    .all(p);
  const byHelper = db()
    .prepare(
      `SELECT u.first_name || ' ' || u.last_name name, COUNT(*) delivered FROM orders o JOIN users u ON u.id = o.assigned_to
       WHERE o.service_date BETWEEN @from AND @to AND o.status = 'delivered' GROUP BY o.assigned_to ORDER BY delivered DESC`,
    )
    .all(p);
  const topFamilies = db()
    .prepare(
      `SELECT u.id, u.first_name || ' ' || u.last_name name, COUNT(*) orders, COALESCE(SUM(o.fee_cents + o.tip_cents),0) revenue
       FROM orders o JOIN users u ON u.id = o.cadet_id
       WHERE o.service_date BETWEEN @from AND @to AND o.status NOT IN ('declined','cancelled','proposed')
       GROUP BY o.cadet_id ORDER BY orders DESC LIMIT 10`,
    )
    .all(p);
  res.json({ from, to, totals, byService, byWeek, byWeekday, byHelper, topFamilies });
});

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

adminRoutes.get('/admin/export/orders.csv', (req, res) => {
  const today = todayIn(timezone());
  const from = typeof req.query.from === 'string' ? req.query.from : addDays(today, -365);
  const to = typeof req.query.to === 'string' ? req.query.to : addDays(today, 365);
  const rows = db()
    .prepare('SELECT * FROM orders WHERE service_date BETWEEN ? AND ? ORDER BY service_date, time')
    .all(from, to) as Record<string, unknown>[];
  const header = ['Ref', 'Date', 'Time', 'Status', 'Service', 'Details', 'Cadet', 'Placed by', 'Payer', 'Driver', 'Fee', 'Tip', 'Payment', 'Method', 'Created'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.ref,
        r.service_date,
        r.time,
        STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status,
        r.service_name,
        detailSummary(r.category as never, json(r.details as string, {})),
        fullName(getUser(r.cadet_id as number)),
        fullName(getUser(r.created_by as number)),
        fullName(getUser(r.payer_id as number)),
        fullName(getUser(r.assigned_to as number)),
        ((r.fee_cents as number) / 100).toFixed(2),
        ((r.tip_cents as number) / 100).toFixed(2),
        r.payment_status,
        r.payment_method,
        r.created_at,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  res.type('text/csv').attachment(`orders-${from}-to-${to}.csv`).send(lines.join('\n'));
});

/** Download a consistent copy of the whole database. */
adminRoutes.get('/admin/backup', async (_req, res) => {
  const file = path.join(os.tmpdir(), `cds-backup-${Date.now()}.sqlite`);
  await db().backup(file);
  res.download(file, `cadet-delivery-${todayIn(timezone())}.sqlite`, () => fs.rm(file, { force: true }, () => {}));
});

adminRoutes.get('/admin/backups', (_req, res) => {
  const files = fs.existsSync(config.backupsDir)
    ? fs
        .readdirSync(config.backupsDir)
        .filter((f) => f.endsWith('.sqlite'))
        .map((f) => ({ name: f, size: fs.statSync(path.join(config.backupsDir, f)).size }))
        .sort((a, b) => b.name.localeCompare(a.name))
    : [];
  res.json({ dir: config.backupsDir, keep: config.backupKeep, files });
});

adminRoutes.post('/admin/backups', async (_req, res) => {
  const name = await createBackup();
  res.status(201).json({ name });
});

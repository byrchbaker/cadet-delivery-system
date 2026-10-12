import { Router } from 'express';
import fs from 'node:fs';
import {
  CLOSED_STATUSES,
  STARTER_DORMS,
  STARTER_LOCATIONS,
  STARTER_SERVICES,
  STARTER_SQUADRONS,
  setupSchema,
  starterClassYears,
  statusLabel,
  toE164,
  type PublicInfoDTO,
} from '@cds/shared';
import { db, tx } from '../db';
import { createSession, hashPassword } from '../lib/auth';
import { conflict, notFound, parse } from '../lib/http';
import { listRuns, listServices } from '../lib/catalog';
import { getOrder, locationDTO, type OrderRow } from '../lib/orders';
import { getSettings, saveSettings, timezone } from '../lib/settings';
import { attachmentPath } from '../lib/uploads';
import { getUser, toUserDTO, type UserRow } from '../lib/users';
import { todayIn } from '@cds/shared';

export const publicRoutes = Router();

export function needsSetup(): boolean {
  return !db().prepare("SELECT 1 FROM users WHERE role = 'organizer' LIMIT 1").get();
}

publicRoutes.get('/public/info', (_req, res) => {
  const profile = getSettings('profile');
  const sched = getSettings('scheduling');
  const info: PublicInfoDTO = {
    needsSetup: needsSetup(),
    profile: {
      businessName: profile.businessName,
      tagline: profile.tagline,
      ownerName: profile.ownerName,
      serviceArea: profile.serviceArea,
      hours: profile.hours,
      about: profile.about,
      facebookUrl: profile.facebookUrl,
    },
    appearance: getSettings('appearance'),
    registration: getSettings('registration'),
    scheduling: { timezone: sched.timezone, minLeadHours: sched.minLeadHours, windowStart: sched.windowStart, windowEnd: sched.windowEnd, blackouts: sched.blackouts },
    lists: getSettings('lists'),
    services: listServices(),
    runs: listRuns({ from: todayIn(timezone()) }).filter((r) => r.isOpen),
  };
  res.json(info);
});

publicRoutes.post('/setup', async (req, res) => {
  if (!needsSetup()) throw conflict('Setup has already been completed.');
  const input = parse(setupSchema, req.body);
  const hash = await hashPassword(input.password);
  const user = tx(() => {
    const info = db()
      .prepare(
        `INSERT INTO users (role, status, email, password_hash, first_name, last_name, phone, phone_e164)
         VALUES ('organizer', 'active', ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.email, hash, input.firstName, input.lastName, input.phone || null, toE164(input.phone));
    const id = Number(info.lastInsertRowid);
    saveSettings('profile', {
      ...getSettings('profile'),
      businessName: input.businessName,
      ownerName: `${input.firstName} ${input.lastName}`,
      phone: input.phone,
      email: input.email,
    });
    if (input.starter.services) {
      const ins = db().prepare('INSERT INTO services (name, category, description, instructions, fee_cents, sort) VALUES (?, ?, ?, ?, ?, ?)');
      STARTER_SERVICES.forEach((s, i) => ins.run(s.name, s.category, s.description, s.instructions, s.feeCents, i));
    }
    if (input.starter.locations) {
      const ins = db().prepare('INSERT INTO locations (name, details, sort) VALUES (?, ?, ?)');
      STARTER_LOCATIONS.forEach((l, i) => ins.run(l.name, l.details, i));
    }
    if (input.starter.lists) {
      saveSettings('lists', { classYears: starterClassYears(), squadrons: STARTER_SQUADRONS, dorms: STARTER_DORMS });
    }
    return db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
  });
  createSession(res, user.id, req.get('user-agent'));
  res.status(201).json({ user: toUserDTO(user) });
});

// ---------------------------------------------------------------------------
// No-login tracking links (sent in texts)

function byToken(t: string): OrderRow {
  const row = db().prepare('SELECT id FROM orders WHERE tracking_token = ?').get(t) as { id: number } | undefined;
  const o = row ? getOrder(row.id) : undefined;
  if (!o) throw notFound('This tracking link is not valid.');
  return o;
}

publicRoutes.get('/public/track/:token', (req, res) => {
  const o = byToken(String(req.params.token));
  const secret = o.surprise !== 'none' && o.status !== 'delivered';
  const cadet = getUser(o.cadet_id);
  const events = (
    db()
      .prepare("SELECT status, created_at FROM order_events WHERE order_id = ? AND type = 'status' AND status IS NOT NULL ORDER BY id")
      .all(o.id) as { status: OrderRow['status']; created_at: string }[]
  ).map((e) => ({ status: e.status, label: statusLabel(e.status, secret ? null : o.category), at: e.created_at }));
  const photo = db().prepare("SELECT id FROM attachments WHERE order_id = ? AND kind = 'delivery' ORDER BY id DESC LIMIT 1").get(o.id);
  const profile = getSettings('profile');
  res.json({
    ref: o.ref,
    status: o.status,
    statusLabel: statusLabel(o.status, secret ? null : o.category),
    category: secret ? 'other' : o.category,
    serviceName: secret ? 'Surprise delivery' : o.service_name,
    serviceDate: o.service_date,
    time: o.time,
    location: locationDTO(o.location_id),
    etaAt: CLOSED_STATUSES.includes(o.status) ? null : o.eta_at,
    deliveredAt: o.delivered_at,
    deliveryNote: secret ? null : o.delivery_note,
    cadetName: cadet ? `${cadet.first_name} ${cadet.last_name.charAt(0)}.` : '',
    events,
    hasPhoto: !!photo && !secret,
    business: { name: profile.businessName, phone: profile.phone },
  });
});

publicRoutes.get('/public/track/:token/photo', (req, res) => {
  const o = byToken(String(req.params.token));
  if (o.surprise !== 'none' && o.status !== 'delivered') throw notFound();
  const a = db().prepare("SELECT path, mime FROM attachments WHERE order_id = ? AND kind = 'delivery' ORDER BY id DESC LIMIT 1").get(o.id) as
    | { path: string; mime: string }
    | undefined;
  if (!a || !fs.existsSync(attachmentPath(a.path))) throw notFound();
  res.type(a.mime).set('Cache-Control', 'private, max-age=3600').sendFile(attachmentPath(a.path));
});

import { Router } from 'express';
import { z } from 'zod';
import { addDays, dateSchema, emailSchema, phoneSchema, todayIn, toE164, type DashboardDTO } from '@cds/shared';
import { db, tx } from '../db';
import { can, me, requireOrganizer, requirePerm, requireStaff } from '../lib/auth';
import { badRequest, intParam, notFound, parse } from '../lib/http';
import { listOrders } from '../lib/orders';
import { timezone } from '../lib/settings';
import { listThreads } from '../lib/threads';
import { getUser, link, linkedCadets, linkedParents, toUserDTO, upsertCadetProfile, type UserRow } from '../lib/users';
import { createResetLink } from './account';

export const staffRoutes = Router();

const count = (sql: string, ...params: unknown[]) => (db().prepare(sql).get(...params) as { n: number }).n;

staffRoutes.get('/staff/dashboard', requireStaff, (req, res) => {
  const user = me(req);
  const today = todayIn(timezone());
  const dispatch = can(user, 'dispatch');
  const scope = dispatch ? '1=1' : `assigned_to = ${user.id}`;
  const monthStart = `${today.slice(0, 8)}01`;
  const weekStart = addDays(today, -6);
  const dto: DashboardDTO = {
    today,
    counts: {
      requested: dispatch ? count("SELECT COUNT(*) n FROM orders WHERE status = 'requested'") : 0,
      proposed: dispatch ? count("SELECT COUNT(*) n FROM orders WHERE status = 'proposed'") : 0,
      today: count(`SELECT COUNT(*) n FROM orders WHERE service_date = ? AND status NOT IN ('declined','cancelled','proposed') AND ${scope}`, today),
      inProgress: count(`SELECT COUNT(*) n FROM orders WHERE status IN ('picking_up','picked_up','en_route') AND ${scope}`),
      unpaid: can(user, 'payments')
        ? count("SELECT COUNT(*) n FROM orders WHERE payment_status = 'unpaid' AND fee_cents + tip_cents > 0 AND status NOT IN ('declined','cancelled','proposed')")
        : 0,
      paymentsToVerify: can(user, 'payments') ? count("SELECT COUNT(*) n FROM orders WHERE payment_status = 'reported'") : 0,
      unreadThreads: listThreads(user).filter((t) => t.unread > 0).length,
      pendingHelpers: user.role === 'organizer' ? count("SELECT COUNT(*) n FROM users WHERE role = 'helper' AND status = 'pending'") : 0,
    },
    revenueWeekCents:
      user.role === 'organizer'
        ? count("SELECT COALESCE(SUM(fee_cents + tip_cents),0) n FROM orders WHERE payment_status = 'paid' AND service_date BETWEEN ? AND ?", weekStart, today)
        : 0,
    revenueMonthCents:
      user.role === 'organizer'
        ? count("SELECT COALESCE(SUM(fee_cents + tip_cents),0) n FROM orders WHERE payment_status = 'paid' AND service_date BETWEEN ? AND ?", monthStart, today)
        : 0,
  };
  res.json(dto);
});

/** Today's work for Run Mode: everything the viewer can move along, in time order. */
staffRoutes.get('/staff/run-sheet', requirePerm('deliver'), (req, res) => {
  const user = me(req);
  const date = typeof req.query.date === 'string' ? req.query.date : todayIn(timezone());
  // Helpers only ever see their own and claimable orders; dispatchers can narrow to "mine".
  const orders = listOrders(user, {
    date,
    status: 'confirmed,picking_up,picked_up,en_route,delivered',
    assigned: can(user, 'dispatch') && req.query.mine === '1' ? 'me' : undefined,
  });
  res.json(orders);
});

staffRoutes.get('/staff/team', requireStaff, (_req, res) => {
  const rows = db()
    .prepare("SELECT * FROM users WHERE (role = 'organizer' OR role = 'helper') AND status = 'active' ORDER BY role DESC, first_name")
    .all() as UserRow[];
  res.json(rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, role: r.role, phone: r.phone })));
});

// ---------------------------------------------------------------------------
// Customer directory

staffRoutes.get('/staff/people', requirePerm('people'), (req, res) => {
  const role = typeof req.query.role === 'string' && ['parent', 'cadet'].includes(req.query.role) ? req.query.role : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where = ["role IN ('parent','cadet')"];
  const params: Record<string, unknown> = {};
  if (role) {
    where.push('role = @role');
    params.role = role;
  }
  if (q) {
    where.push("(first_name || ' ' || last_name LIKE @q OR email LIKE @q OR phone LIKE @q)");
    params.q = `%${q}%`;
  }
  const rows = db()
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.cadet_id = u.id OR o.created_by = u.id) order_count
       FROM users u WHERE ${where.join(' AND ')} ORDER BY last_name, first_name LIMIT 500`,
    )
    .all(params) as (UserRow & { order_count: number })[];
  res.json(
    rows.map((r) => ({
      ...toUserDTO(r),
      orderCount: r.order_count,
      family: (r.role === 'cadet' ? linkedParents(r.id) : linkedCadets(r.id)).map((f) => ({ id: f.id, firstName: f.first_name, lastName: f.last_name })),
    })),
  );
});

staffRoutes.get('/staff/people/:id', requirePerm('people'), (req, res) => {
  const user = me(req);
  const row = getUser(intParam(req));
  if (!row || !['parent', 'cadet'].includes(row.role)) throw notFound();
  const family = (row.role === 'cadet' ? linkedParents(row.id) : linkedCadets(row.id)).map((f) => toUserDTO(f));
  const orders = can(user, 'dispatch') ? listOrders(user, { personId: row.id, limit: 50 }) : [];
  const subs = row.role === 'cadet' ? db().prepare('SELECT * FROM subscriptions WHERE cadet_id = ? ORDER BY ends_on DESC').all(row.id) : [];
  res.json({ user: toUserDTO(row, { includeStaffNotes: true }), family, orders, subscriptions: subs });
});

staffRoutes.patch('/staff/people/:id', requireOrganizer, (req, res) => {
  const id = intParam(req);
  const row = getUser(id);
  if (!row || !['parent', 'cadet'].includes(row.role)) throw notFound();
  const input = parse(z.object({ staffNotes: z.string().max(4000).optional(), status: z.enum(['active', 'suspended']).optional() }), req.body);
  db()
    .prepare('UPDATE users SET staff_notes = COALESCE(?, staff_notes), status = COALESCE(?, status) WHERE id = ?')
    .run(input.staffNotes ?? null, input.status ?? null, id);
  if (input.status === 'suspended') db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ user: toUserDTO(getUser(id)!, { includeStaffNotes: true }) });
});

staffRoutes.post('/staff/people/:id/reset-link', requireOrganizer, (req, res) => {
  const row = getUser(intParam(req));
  if (!row) throw notFound();
  if (!row.email) throw badRequest('Add an email address to this person first.');
  res.json({ url: createResetLink(row.id, 72) });
});

/** Add a family by hand — for requests that arrive by text or Facebook. */
staffRoutes.post('/staff/customers', requirePerm('dispatch'), (req, res) => {
  const person = z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    phone: phoneSchema,
    email: z.union([emailSchema, z.literal('')]).optional(),
  });
  const input = parse(
    z.object({
      cadet: person.extend({ classYear: z.string().max(20).default(''), squadron: z.string().max(40).default(''), dorm: z.string().max(80).default('') }),
      parent: person.optional(),
    }),
    req.body,
  );
  const taken = (email?: string) => !!email && !!db().prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (taken(input.cadet.email)) throw badRequest('A cadet with that email already exists — search the directory instead.');
  if (taken(input.parent?.email)) throw badRequest('A parent with that email already exists — search the directory instead.');
  const ids = tx(() => {
    const ins = db().prepare(
      "INSERT INTO users (role, status, email, first_name, last_name, phone, phone_e164, managed_by) VALUES (?, 'active', ?, ?, ?, ?, ?, ?)",
    );
    const c = input.cadet;
    const cadetId = Number(ins.run('cadet', c.email || null, c.firstName, c.lastName, c.phone, toE164(c.phone), me(req).id).lastInsertRowid);
    upsertCadetProfile(cadetId, { classYear: c.classYear, squadron: c.squadron, dorm: c.dorm });
    let parentId: number | null = null;
    if (input.parent) {
      const p = input.parent;
      parentId = Number(ins.run('parent', p.email || null, p.firstName, p.lastName, p.phone, toE164(p.phone), me(req).id).lastInsertRowid);
      link(parentId, cadetId);
    }
    return { cadetId, parentId };
  });
  res.status(201).json(ids);
});

// ---------------------------------------------------------------------------
// Semester subscriptions

staffRoutes.get('/staff/subscriptions', requirePerm('payments'), (_req, res) => {
  const rows = db()
    .prepare(
      `SELECT s.*, u.first_name, u.last_name FROM subscriptions s JOIN users u ON u.id = s.cadet_id
       ORDER BY s.ends_on DESC, u.last_name`,
    )
    .all();
  res.json(rows);
});

staffRoutes.post('/staff/subscriptions', requirePerm('payments'), (req, res) => {
  const input = parse(
    z.object({ cadetId: z.number().int().positive(), label: z.string().trim().min(1).max(80), startsOn: dateSchema, endsOn: dateSchema, notes: z.string().max(500).default('') }),
    req.body,
  );
  const cadet = getUser(input.cadetId);
  if (!cadet || cadet.role !== 'cadet') throw badRequest('Choose a cadet.');
  if (input.endsOn < input.startsOn) throw badRequest('End date must be after start date.');
  const info = db()
    .prepare('INSERT INTO subscriptions (cadet_id, label, starts_on, ends_on, notes) VALUES (?, ?, ?, ?, ?)')
    .run(input.cadetId, input.label, input.startsOn, input.endsOn, input.notes);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

staffRoutes.delete('/staff/subscriptions/:id', requirePerm('payments'), (req, res) => {
  db().prepare('DELETE FROM subscriptions WHERE id = ?').run(intParam(req));
  res.json({ ok: true });
});

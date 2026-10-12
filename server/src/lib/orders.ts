import {
  CATEGORIES,
  CLOSED_STATUSES,
  STATUS_LABELS,
  SETTLED_PAYMENT,
  clockIn,
  detailSummary,
  money,
  shortDate,
  statusLabel,
  time12,
  timeBoth,
  vendorOf,
  zonedToUtc,
  type AttachmentDTO,
  type Category,
  type LocationDTO,
  type OrderDTO,
  type OrderEventDTO,
  type OrderInput,
  type OrderStatus,
  type PaymentStatus,
  type SurpriseMode,
  type TemplateKey,
} from '@cds/shared';
import { db, json, tx } from '../db';
import { notify, type Vars } from '../notify';
import { publish } from '../realtime';
import { can, staff } from './auth';
import { badRequest, conflict, forbidden, notFound } from './http';
import { shortCode, token } from './ids';
import { getSettings, timezone } from './settings';
import {
  fullName,
  getCadetProfile,
  getUser,
  isLinked,
  linkedParents,
  staffWith,
  toPerson,
  type AuthUser,
  type UserRow,
} from './users';

export interface OrderRow {
  id: number;
  ref: string;
  status: OrderStatus;
  service_id: number;
  service_name: string;
  category: Category;
  fee_cents: number;
  tip_cents: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  service_date: string;
  time: string;
  location_id: number | null;
  details: string;
  notes: string;
  staff_notes: string;
  surprise: SurpriseMode;
  short_notice: number;
  cadet_id: number;
  created_by: number;
  payer_id: number | null;
  assigned_to: number | null;
  run_id: number | null;
  eta_at: string | null;
  delivered_at: string | null;
  delivery_note: string | null;
  tracking_token: string;
  reminder_sent_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

const FLOW_STATUSES: OrderStatus[] = ['confirmed', 'picking_up', 'picked_up', 'en_route'];

export function getOrder(id: number): OrderRow | undefined {
  return db().prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
}

export function mustGetOrder(id: number): OrderRow {
  const o = getOrder(id);
  if (!o) throw notFound('Order not found.');
  return o;
}

// ---------------------------------------------------------------------------
// Visibility

export interface Relation {
  visible: boolean;
  redacted: boolean;
  customer: boolean;
  manage: boolean;
  assigned: boolean;
}

/** Surprise contents stay hidden from the cadet until delivered. */
function hiddenFromCadet(o: Pick<OrderRow, 'surprise' | 'status'>): boolean {
  if (o.surprise === 'hidden') return o.status !== 'delivered';
  if (o.surprise === 'heads_up') return !['confirmed', 'picking_up', 'picked_up', 'en_route', 'delivered'].includes(o.status);
  return false;
}

export function relation(o: OrderRow, user: AuthUser): Relation {
  const manage = can(user, 'dispatch');
  const assigned = o.assigned_to === user.id;
  if (manage) return { visible: true, redacted: false, customer: false, manage, assigned };
  if (user.role === 'helper') {
    const claimable = can(user, 'claim') && !o.assigned_to && FLOW_STATUSES.includes(o.status);
    const deliverer = assigned && user.status === 'active';
    return { visible: deliverer || claimable, redacted: false, customer: false, manage: false, assigned };
  }
  if (user.role === 'cadet') {
    if (o.cadet_id !== user.id) return { visible: false, redacted: false, customer: false, manage: false, assigned: false };
    if (o.created_by === user.id || o.surprise === 'none') return { visible: true, redacted: false, customer: true, manage: false, assigned: false };
    if (hiddenFromCadet(o)) return { visible: false, redacted: false, customer: false, manage: false, assigned: false };
    return { visible: true, redacted: o.status !== 'delivered', customer: true, manage: false, assigned: false };
  }
  // parent / family
  const involved = o.created_by === user.id || o.payer_id === user.id || isLinked(user.id, o.cadet_id);
  return { visible: involved, redacted: false, customer: involved, manage: false, assigned: false };
}

export function viewable(o: OrderRow, user: AuthUser): Relation {
  const rel = relation(o, user);
  if (!rel.visible) throw notFound('Order not found.');
  return rel;
}

function visibilitySql(user: AuthUser): { sql: string; params: Record<string, unknown> } {
  const uid = { uid: user.id };
  if (can(user, 'dispatch')) return { sql: '1=1', params: {} };
  if (user.role === 'helper') {
    const parts = ['o.assigned_to = @uid'];
    if (can(user, 'claim')) parts.push("(o.assigned_to IS NULL AND o.status IN ('confirmed','picking_up','picked_up','en_route'))");
    return { sql: `(${parts.join(' OR ')})`, params: uid };
  }
  if (user.role === 'cadet') {
    return {
      sql: `(o.cadet_id = @uid AND (o.created_by = @uid OR o.surprise = 'none'
              OR (o.surprise = 'hidden' AND o.status = 'delivered')
              OR (o.surprise = 'heads_up' AND o.status IN ('confirmed','picking_up','picked_up','en_route','delivered'))))`,
      params: uid,
    };
  }
  return {
    sql: '(o.created_by = @uid OR o.payer_id = @uid OR o.cadet_id IN (SELECT cadet_id FROM family_links WHERE parent_id = @uid))',
    params: uid,
  };
}

export interface OrderFilters {
  scope?: 'active' | 'history' | 'today' | 'upcoming' | 'all';
  status?: string;
  date?: string;
  from?: string;
  to?: string;
  q?: string;
  assigned?: string;
  payment?: string;
  runId?: number;
  cadetId?: number;
  personId?: number;
  limit?: number;
}

export function listOrders(user: AuthUser, f: OrderFilters): OrderDTO[] {
  const vis = visibilitySql(user);
  const where = [vis.sql];
  const params: Record<string, unknown> = { ...vis.params };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone() }).format(new Date());
  let order = 'o.service_date ASC, o.time ASC';
  switch (f.scope) {
    case 'active':
      where.push("o.status NOT IN ('delivered','declined','cancelled')");
      break;
    case 'history':
      where.push("o.status IN ('delivered','declined','cancelled')");
      order = 'o.service_date DESC, o.time DESC';
      break;
    case 'today':
      where.push('o.service_date = @today');
      params.today = today;
      break;
    case 'upcoming':
      where.push("o.service_date >= @today AND o.status NOT IN ('declined','cancelled')");
      params.today = today;
      break;
    default:
      order = 'o.service_date DESC, o.time DESC';
  }
  if (f.status) {
    const list = f.status.split(',').filter(Boolean);
    where.push(`o.status IN (${list.map((_, i) => `@st${i}`).join(',')})`);
    list.forEach((s, i) => (params[`st${i}`] = s));
  }
  if (f.date) {
    where.push('o.service_date = @date');
    params.date = f.date;
  }
  if (f.from) {
    where.push('o.service_date >= @from');
    params.from = f.from;
  }
  if (f.to) {
    where.push('o.service_date <= @to');
    params.to = f.to;
  }
  if (f.payment) {
    where.push('o.payment_status = @payment');
    params.payment = f.payment;
  }
  if (f.runId) {
    where.push('o.run_id = @runId');
    params.runId = f.runId;
  }
  if (f.cadetId) {
    where.push('o.cadet_id = @cadetId');
    params.cadetId = f.cadetId;
  }
  if (f.personId) {
    where.push('(o.cadet_id = @pid OR o.created_by = @pid OR o.payer_id = @pid)');
    params.pid = f.personId;
  }
  if (f.assigned === 'me') {
    where.push('o.assigned_to = @me');
    params.me = user.id;
  } else if (f.assigned === 'none') {
    where.push('o.assigned_to IS NULL');
  } else if (f.assigned && /^\d+$/.test(f.assigned)) {
    where.push('o.assigned_to = @assignee');
    params.assignee = Number(f.assigned);
  }
  if (f.q) {
    where.push(`(o.ref LIKE @q OR o.service_name LIKE @q OR o.details LIKE @q OR o.notes LIKE @q
      OR EXISTS (SELECT 1 FROM users u WHERE u.id IN (o.cadet_id, o.created_by, o.payer_id)
                 AND (u.first_name || ' ' || u.last_name LIKE @q OR u.email LIKE @q OR u.phone LIKE @q)))`);
    params.q = `%${f.q.replace(/^#/, '')}%`;
  }
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);
  const rows = db()
    .prepare(`SELECT o.* FROM orders o WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`)
    .all(params) as OrderRow[];
  const cache = new Map<number, UserRow | undefined>();
  return rows.map((r) => toOrderDTO(r, user, { cache }));
}

// ---------------------------------------------------------------------------
// DTO

export function locationDTO(id: number | null): LocationDTO | null {
  if (!id) return null;
  const l = db().prepare('SELECT * FROM locations WHERE id = ?').get(id) as
    | { id: number; name: string; details: string; active: number; sort: number }
    | undefined;
  return l ? { id: l.id, name: l.name, details: l.details, active: !!l.active, sort: l.sort } : null;
}

export function attachmentDTO(a: { id: number; kind: string; name: string; mime: string; created_at: string }): AttachmentDTO {
  return { id: a.id, kind: a.kind as AttachmentDTO['kind'], name: a.name, mime: a.mime, url: `/api/files/${a.id}`, createdAt: a.created_at };
}

const SECRET_SENDER = { id: 0, role: 'parent' as const, firstName: 'Someone', lastName: 'special' };

export function toOrderDTO(
  o: OrderRow,
  viewer: AuthUser,
  opts: { events?: boolean; cache?: Map<number, UserRow | undefined> } = {},
): OrderDTO {
  const rel = relation(o, viewer);
  const cache = opts.cache ?? new Map<number, UserRow | undefined>();
  const u = (id: number | null) => {
    if (!id) return undefined;
    if (!cache.has(id)) cache.set(id, getUser(id));
    return cache.get(id);
  };
  const isStaff = staff(viewer);
  const contact = isStaff;
  const cadetRow = u(o.cadet_id);
  const details = json<Record<string, string | number | boolean | null>>(o.details, {});
  const redacted = rel.redacted;
  const closed = CLOSED_STATUSES.includes(o.status);
  const total = o.fee_cents + o.tip_cents;
  const thread = db().prepare("SELECT id FROM threads WHERE kind = 'order' AND order_id = ?").get(o.id) as { id: number } | undefined;
  const attachments = (
    db().prepare('SELECT id, kind, name, mime, created_at FROM attachments WHERE order_id = ? AND thread_id IS NULL ORDER BY id').all(o.id) as {
      id: number;
      kind: string;
      name: string;
      mime: string;
      created_at: string;
    }[]
  )
    .filter((a) => !redacted || a.kind === 'delivery')
    .map(attachmentDTO);
  const run = o.run_id ? (db().prepare('SELECT id, title FROM runs WHERE id = ?').get(o.run_id) as { id: number; title: string } | undefined) : undefined;
  const isPayerish =
    o.payer_id === viewer.id || (!o.payer_id && o.created_by === viewer.id) || (viewer.role === 'parent' && rel.customer);

  const dto: OrderDTO = {
    id: o.id,
    ref: o.ref,
    status: o.status,
    category: redacted ? 'other' : o.category,
    serviceId: o.service_id,
    serviceName: redacted ? 'Surprise delivery' : o.service_name,
    feeCents: redacted ? 0 : o.fee_cents,
    tipCents: redacted ? 0 : o.tip_cents,
    totalCents: redacted ? 0 : total,
    paymentStatus: redacted ? 'paid' : o.payment_status,
    paymentMethod: redacted ? null : o.payment_method,
    paymentRef: redacted ? null : o.payment_ref,
    serviceDate: o.service_date,
    time: o.time,
    location: locationDTO(o.location_id),
    details: redacted ? {} : details,
    summary: redacted ? 'Contents are a surprise' : detailSummary(o.category, details),
    notes: redacted ? '' : o.notes,
    staffNotes: isStaff ? o.staff_notes : undefined,
    surprise: o.surprise,
    redacted,
    shortNotice: !!o.short_notice,
    cadet: { ...toPerson(cadetRow, { contact: contact || viewer.role === 'parent' })!, cadet: getCadetProfile(o.cadet_id) },
    createdBy: redacted ? SECRET_SENDER : toPerson(u(o.created_by), { contact })!,
    payer: redacted ? null : toPerson(u(o.payer_id), { contact }),
    assignedTo: toPerson(u(o.assigned_to)),
    run: run ?? null,
    etaAt: o.eta_at,
    deliveredAt: o.delivered_at,
    deliveryNote: o.delivery_note,
    threadId: rel.redacted ? null : (thread?.id ?? null),
    trackingToken: redacted ? undefined : o.tracking_token,
    attachments,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    can: {
      edit: (rel.manage && !closed) || (o.created_by === viewer.id && ['proposed', 'requested'].includes(o.status)),
      cancel: (rel.manage && !closed) || (rel.customer && !redacted && ['proposed', 'requested', 'confirmed'].includes(o.status)),
      pay:
        !redacted &&
        rel.customer &&
        isPayerish &&
        o.payment_status === 'unpaid' &&
        total > 0 &&
        !['declined', 'cancelled', 'proposed'].includes(o.status),
      respond: viewer.id === o.cadet_id && o.status === 'proposed',
      manage: rel.manage,
      deliver: (rel.manage || (can(viewer, 'deliver') && rel.assigned)) && FLOW_STATUSES.includes(o.status),
      claim: can(viewer, 'claim') && !o.assigned_to && FLOW_STATUSES.includes(o.status) && viewer.role === 'helper',
      verifyPayment: can(viewer, 'payments') && !redacted && ['unpaid', 'reported'].includes(o.payment_status) && total > 0,
    },
  };

  if (opts.events) {
    const rows = db().prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id').all(o.id) as {
      id: number;
      type: string;
      status: OrderStatus | null;
      message: string;
      actor_id: number | null;
      created_at: string;
    }[];
    const events: OrderEventDTO[] = [];
    for (const e of rows) {
      if (redacted || (viewer.role === 'cadet' && o.surprise !== 'none' && o.created_by !== viewer.id)) {
        if (e.type !== 'status' || !e.status || !['confirmed', 'en_route', 'delivered'].includes(e.status)) continue;
        events.push({ id: e.id, type: e.type, status: e.status, message: statusLabel(e.status, null), actor: null, createdAt: e.created_at });
        continue;
      }
      if (!isStaff && e.type === 'staff') continue;
      events.push({ id: e.id, type: e.type, status: e.status, message: e.message, actor: toPerson(u(e.actor_id)), createdAt: e.created_at });
    }
    dto.events = events;
  }
  return dto;
}

// ---------------------------------------------------------------------------
// Events, recipients and realtime

export function addEvent(orderId: number, type: string, message: string, actorId: number | null, status: OrderStatus | null = null): void {
  db().prepare('INSERT INTO order_events (order_id, type, status, message, actor_id) VALUES (?, ?, ?, ?, ?)').run(orderId, type, status, message, actorId);
}

/** Everyone who should see live updates for this order. */
export function audienceIds(o: OrderRow): number[] {
  const ids = new Set<number>([o.created_by, o.cadet_id]);
  if (o.payer_id) ids.add(o.payer_id);
  if (o.assigned_to) ids.add(o.assigned_to);
  for (const p of linkedParents(o.cadet_id)) ids.add(p.id);
  for (const s of staffWith('dispatch')) ids.add(s.id);
  if (!o.assigned_to && FLOW_STATUSES.includes(o.status)) for (const s of staffWith('claim')) ids.add(s.id);
  return [...ids];
}

export function publishOrder(o: OrderRow): void {
  publish(audienceIds(o), { type: 'order', id: o.id });
}

/** Customers who get status updates: whoever placed it, whoever pays, and the cadet (unless it's a surprise). */
export function customerRecipients(o: OrderRow, opts: { includeCadet?: boolean } = {}): UserRow[] {
  const out: UserRow[] = [];
  const add = (row: UserRow | undefined) => {
    if (row && !out.some((r) => r.id === row.id) && row.role !== 'organizer' && row.role !== 'helper') out.push(row);
  };
  add(getUser(o.created_by));
  add(getUser(o.payer_id));
  if (opts.includeCadet ?? o.surprise === 'none') add(getUser(o.cadet_id));
  return out;
}

export function orderLink(o: OrderRow, user: UserRow, kind: 'track' | 'app' = 'track'): string {
  if (user.role === 'organizer' || user.role === 'helper') return `/app/orders/${o.id}`;
  if (kind === 'app' && user.password_hash) return `/app/orders/${o.id}`;
  return `/t/${o.tracking_token}`;
}

export function orderVars(o: OrderRow, recipient?: UserRow, extra: Vars = {}): Vars {
  const tz = timezone();
  const cadet = getUser(o.cadet_id);
  const creator = getUser(o.created_by);
  const driver = getUser(o.assigned_to) ?? staffWith(null)[0];
  const details = json<Record<string, unknown>>(o.details, {});
  const location = locationDTO(o.location_id);
  const total = o.fee_cents + o.tip_cents;
  let paymentNote = '';
  if (o.payment_status === 'covered') paymentNote = 'Covered by your subscription.';
  else if (SETTLED_PAYMENT.includes(o.payment_status)) paymentNote = 'Paid — thank you!';
  else if (o.payment_status === 'reported') paymentNote = 'Payment received for verification.';
  else if (total > 0) paymentNote = `Delivery fee ${money(total)} is due.`;
  const surpriseForCadet = recipient?.id === o.cadet_id && o.surprise !== 'none' && o.status !== 'delivered';
  return {
    cadet: fullName(cadet),
    cadetFirst: cadet?.first_name ?? '',
    cadetLast: cadet ? `Cadet ${cadet.last_name}` : '',
    sender: creator ? (recipient?.id === o.cadet_id ? creator.first_name : fullName(creator)) : '',
    driver: driver?.first_name ?? 'Your driver',
    service: surpriseForCadet ? 'a surprise delivery' : o.service_name,
    vendor: surpriseForCadet ? 'pickup' : (vendorOf(details) ?? 'the pickup'),
    ref: `#${o.ref}`,
    date: shortDate(o.service_date),
    time: timeBoth(o.time),
    location: location?.name ?? (typeof details.destination === 'string' ? details.destination : 'the delivery point'),
    eta: o.eta_at ? time12(clockIn(o.eta_at, tz)) : time12(o.time),
    amount: money(total),
    paymentNote,
    ...extra,
  };
}

function notifyCustomers(o: OrderRow, event: TemplateKey, actorId: number | null, extra: Vars = {}): void {
  const recipients = customerRecipients(o);
  notify({
    event,
    to: recipients,
    exclude: actorId ?? undefined,
    orderId: o.id,
    vars: (u) => orderVars(o, u, extra),
    link: (u) => orderLink(o, u),
  });
}

function notifySurpriseCadet(o: OrderRow, event: TemplateKey, extra: Vars = {}): void {
  const cadet = getUser(o.cadet_id);
  if (!cadet) return;
  notify({ event, to: [cadet], orderId: o.id, vars: orderVars(o, cadet, extra), link: `/t/${o.tracking_token}` });
}

// ---------------------------------------------------------------------------
// Creation

function sanitizeDetails(category: Category, input: Record<string, unknown>): Record<string, string | number | boolean> {
  const spec = CATEGORIES[category];
  const out: Record<string, string | number | boolean> = {};
  const missing: Record<string, string> = {};
  for (const field of spec.fields) {
    const raw = input[field.key];
    let value: string | number | boolean | undefined;
    if (field.type === 'checkbox') value = raw === true || raw === 'true' || raw === 'on';
    else if (field.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      value = raw === '' || raw === null || raw === undefined || Number.isNaN(n) ? undefined : n;
    } else if (typeof raw === 'string' || typeof raw === 'number') value = String(raw).trim().slice(0, 2000);
    if (field.type === 'select' && value && !field.options?.some((o) => o.value === value)) value = undefined;
    if (value === undefined || value === '') {
      if (field.required) missing[`details.${field.key}`] = `${field.label} is required`;
      continue;
    }
    out[field.key] = value;
  }
  if (Object.keys(missing).length) throw badRequest(Object.values(missing)[0], missing);
  return out;
}

function uniqueRef(): string {
  for (;;) {
    const ref = shortCode(5);
    if (!db().prepare('SELECT 1 FROM orders WHERE ref = ?').get(ref)) return ref;
  }
}

export function hasSubscription(cadetId: number, date: string): boolean {
  return !!db().prepare('SELECT 1 FROM subscriptions WHERE cadet_id = ? AND starts_on <= ? AND ends_on >= ?').get(cadetId, date, date);
}

interface ServiceRow {
  id: number;
  name: string;
  category: Category;
  fee_cents: number;
  active: number;
}

interface RunRow {
  id: number;
  title: string;
  service_id: number;
  vendor: string;
  run_date: string;
  pickup_time: string;
  cutoff_at: string | null;
  location_id: number | null;
  capacity: number;
  fee_cents: number | null;
  status: string;
}

export function runIsOpen(run: RunRow, now = new Date()): boolean {
  if (run.status !== 'open') return false;
  const cutoff = run.cutoff_at ? new Date(run.cutoff_at) : zonedToUtc(run.run_date, run.pickup_time, timezone());
  if (cutoff.getTime() <= now.getTime()) return false;
  if (run.capacity > 0) {
    const n = (db().prepare("SELECT COUNT(*) n FROM orders WHERE run_id = ? AND status NOT IN ('declined','cancelled')").get(run.id) as { n: number }).n;
    if (n >= run.capacity) return false;
  }
  return true;
}

export function createOrder(input: OrderInput, actor: AuthUser): OrderRow {
  const isStaffActor = can(actor, 'dispatch');
  if (!isStaffActor && actor.role !== 'parent' && actor.role !== 'cadet') throw forbidden('Your account cannot place orders.');

  const service = db().prepare('SELECT * FROM services WHERE id = ?').get(input.serviceId) as ServiceRow | undefined;
  if (!service || (!service.active && !isStaffActor)) throw badRequest('That service is not available.');

  const cadet = getUser(input.cadetId);
  if (!cadet || cadet.role !== 'cadet') throw badRequest('Choose a cadet for this order.');
  if (actor.role === 'cadet' && cadet.id !== actor.id) throw forbidden('Cadets can only order for themselves.');
  if (actor.role === 'parent' && !isLinked(actor.id, cadet.id)) throw forbidden('That cadet is not linked to your account.');

  // Group run
  let run: RunRow | undefined;
  let serviceDate = input.serviceDate;
  let time = input.time;
  let locationId = input.locationId ?? null;
  let fee = service.fee_cents;
  if (input.runId) {
    run = db().prepare('SELECT * FROM runs WHERE id = ?').get(input.runId) as RunRow | undefined;
    if (!run) throw badRequest('That group run no longer exists.');
    if (!isStaffActor && !runIsOpen(run)) throw badRequest('That group run is closed or full.');
    serviceDate = run.run_date;
    time = run.pickup_time;
    locationId = run.location_id ?? locationId;
    if (run.fee_cents !== null) fee = run.fee_cents;
    if (run.service_id !== service.id) throw badRequest('Service does not match the group run.');
  }

  const details = sanitizeDetails(service.category, { ...(run?.vendor ? { vendor: run.vendor } : {}), ...input.details });
  if (run?.vendor && !details.vendor) details.vendor = run.vendor;

  const sched = getSettings('scheduling');
  const tz = sched.timezone;
  const when = zonedToUtc(serviceDate, time, tz);
  const hoursAhead = (when.getTime() - Date.now()) / 3_600_000;
  let shortNotice = false;
  if (!isStaffActor) {
    if (hoursAhead < 0) throw badRequest('That time has already passed.', { serviceDate: 'Pick a future date and time' });
    const blackout = sched.blackouts.find((b) => b.date === serviceDate);
    if (blackout) throw badRequest(`Deliveries are not available on that date${blackout.reason ? ` — ${blackout.reason}` : ''}.`, { serviceDate: 'Unavailable date' });
    if (!run && hoursAhead < sched.minLeadHours) {
      if (!sched.allowShortNotice) throw badRequest(`Orders need at least ${sched.minLeadHours} hours notice.`, { serviceDate: 'Too soon' });
      shortNotice = true;
    }
    if (sched.maxPerDay > 0 && !run) {
      const n = (db().prepare("SELECT COUNT(*) n FROM orders WHERE service_date = ? AND run_id IS NULL AND status NOT IN ('declined','cancelled','proposed')").get(serviceDate) as { n: number }).n;
      if (n >= sched.maxPerDay) throw badRequest('That day is fully booked. Please choose another date.', { serviceDate: 'Fully booked' });
    }
  }

  if (locationId) {
    const loc = db().prepare('SELECT active FROM locations WHERE id = ?').get(locationId) as { active: number } | undefined;
    if (!loc) throw badRequest('Choose a delivery location.');
  } else if (service.category !== 'transport') {
    const fallback = sched.defaultLocationId ?? (db().prepare('SELECT id FROM locations WHERE active = 1 ORDER BY sort, id LIMIT 1').get() as { id: number } | undefined)?.id;
    locationId = fallback ?? null;
  }

  // Who pays
  let payerId: number | null = actor.id;
  let status: OrderStatus = 'requested';
  let surprise: SurpriseMode = 'none';
  if (actor.role === 'cadet') {
    if (input.payer === 'family') {
      if (!input.payerId || !isLinked(input.payerId, actor.id)) throw badRequest('Choose a family member to cover this order.', { payerId: 'Required' });
      payerId = input.payerId;
    }
  } else if (actor.role === 'parent') {
    surprise = input.surprise;
    if (input.askCadet) {
      if (surprise !== 'none') throw badRequest("Surprises can't also ask the cadet to confirm.");
      if (!cadet.password_hash) throw badRequest(`${cadet.first_name} hasn't joined yet, so they can't confirm. Invite them from Family, or send it without confirmation.`);
      status = 'proposed';
    }
  } else if (isStaffActor) {
    // Logged by staff on someone's behalf (e.g. a request that came in by text).
    payerId = input.payerId ?? linkedParents(cadet.id)[0]?.id ?? cadet.id;
    surprise = input.surprise;
    status = 'confirmed';
  }

  const tip = getSettings('payments').allowTips ? input.tipCents : 0;
  let paymentStatus: PaymentStatus = 'unpaid';
  if (hasSubscription(cadet.id, serviceDate)) paymentStatus = 'covered';
  else if (fee + tip === 0) paymentStatus = 'waived';

  const row = tx(() => {
    const info = db()
      .prepare(
        `INSERT INTO orders (ref, status, service_id, service_name, category, fee_cents, tip_cents, payment_status,
           service_date, time, location_id, details, notes, surprise, short_notice, cadet_id, created_by, payer_id,
           run_id, tracking_token, assigned_to)
         VALUES (@ref, @status, @service_id, @service_name, @category, @fee, @tip, @payment_status, @service_date, @time,
           @location_id, @details, @notes, @surprise, @short_notice, @cadet_id, @created_by, @payer_id, @run_id, @token, NULL)`,
      )
      .run({
        ref: uniqueRef(),
        status,
        service_id: service.id,
        service_name: run ? run.title : service.name,
        category: service.category,
        fee,
        tip,
        payment_status: paymentStatus,
        service_date: serviceDate,
        time,
        location_id: locationId,
        details: JSON.stringify(details),
        notes: input.notes,
        surprise,
        short_notice: shortNotice ? 1 : 0,
        cadet_id: cadet.id,
        created_by: actor.id,
        payer_id: payerId,
        run_id: run?.id ?? null,
        token: token(12),
      });
    const id = Number(info.lastInsertRowid);
    db().prepare("INSERT INTO threads (kind, order_id) VALUES ('order', ?)").run(id);
    const verb = status === 'proposed' ? `Proposed to ${cadet.first_name} for confirmation` : isStaffActor ? 'Logged and confirmed by staff' : 'Request submitted';
    addEvent(id, 'status', verb, actor.id, status);
    if (paymentStatus === 'covered') addEvent(id, 'payment', 'Covered by subscription', null);
    return getOrder(id)!;
  });

  // Notifications
  if (status === 'proposed') {
    notify({ event: 'order_proposed', to: [cadet], orderId: row.id, vars: orderVars(row, cadet), link: `/app/orders/${row.id}` });
  } else if (status === 'requested') {
    announceRequest(row, actor.id);
  } else if (status === 'confirmed') {
    notifyCustomers(row, 'order_confirmed', actor.id);
  }
  publishOrder(row);
  return row;
}

function announceRequest(o: OrderRow, actorId: number): void {
  notify({
    event: 'order_submitted',
    to: staffWith('dispatch'),
    exclude: actorId,
    orderId: o.id,
    vars: orderVars(o),
    link: `/app/orders/${o.id}`,
  });
  if (o.payer_id && o.payer_id !== o.created_by) {
    const payer = getUser(o.payer_id);
    notify({ event: 'payment_requested', to: [payer], orderId: o.id, vars: orderVars(o, payer), link: `/app/orders/${o.id}` });
  }
}

// ---------------------------------------------------------------------------
// Customer actions

export function respondToProposal(o: OrderRow, actor: AuthUser, accept: boolean, note: string): OrderRow {
  if (o.cadet_id !== actor.id || o.status !== 'proposed') throw conflict('This order is no longer waiting for you.');
  const next: OrderStatus = accept ? 'requested' : 'declined';
  db().prepare("UPDATE orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(next, o.id);
  addEvent(o.id, 'status', accept ? `Accepted by ${actor.first_name}${note ? ` — “${note}”` : ''}` : `Declined by ${actor.first_name}${note ? ` — “${note}”` : ''}`, actor.id, next);
  const updated = getOrder(o.id)!;
  const creator = getUser(o.created_by);
  notify({
    event: accept ? 'proposal_accepted' : 'proposal_declined',
    to: [creator],
    orderId: o.id,
    vars: orderVars(updated, creator, { note }),
    link: `/app/orders/${o.id}`,
  });
  if (accept) announceRequest(updated, actor.id);
  publishOrder(updated);
  return updated;
}

export function cancelOrder(o: OrderRow, actor: AuthUser, reason: string): OrderRow {
  const rel = relation(o, actor);
  const allowed = (rel.manage && !CLOSED_STATUSES.includes(o.status)) || (rel.customer && !rel.redacted && ['proposed', 'requested', 'confirmed'].includes(o.status));
  if (!allowed) throw conflict('This order can no longer be cancelled here. Send a message instead.');
  db()
    .prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(reason || null, o.id);
  addEvent(o.id, 'status', `Cancelled by ${actor.first_name}${reason ? ` — ${reason}` : ''}`, actor.id, 'cancelled');
  const updated = getOrder(o.id)!;
  const recipients: (UserRow | undefined)[] = [...customerRecipients(updated, { includeCadet: !hiddenFromCadet(o) })];
  if (o.status !== 'proposed') recipients.push(...staffWith('dispatch'));
  if (o.assigned_to) recipients.push(getUser(o.assigned_to));
  notify({
    event: 'order_cancelled',
    to: recipients,
    exclude: actor.id,
    orderId: o.id,
    vars: (u) => orderVars(updated, u, { note: reason }),
    link: (u) => orderLink(updated, u, 'app'),
  });
  publishOrder(updated);
  return updated;
}

export function reportPayment(o: OrderRow, actor: AuthUser, method: string, reference: string): OrderRow {
  const dto = toOrderDTO(o, actor);
  if (!dto.can.pay) throw conflict('This order is not awaiting payment from you.');
  db()
    .prepare(
      "UPDATE orders SET payment_status = 'reported', payment_method = ?, payment_ref = ?, payer_id = COALESCE(payer_id, ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .run(method, reference || null, actor.id, o.id);
  addEvent(o.id, 'payment', `${actor.first_name} sent ${money(o.fee_cents + o.tip_cents)} via ${method}${reference ? ` (ref ${reference})` : ''}`, actor.id);
  const updated = getOrder(o.id)!;
  notify({
    event: 'payment_reported',
    to: staffWith('payments'),
    exclude: actor.id,
    orderId: o.id,
    vars: orderVars(updated, undefined, { sender: fullName(actor), method }),
    link: `/app/orders/${o.id}`,
  });
  publishOrder(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Staff actions

export function setPayment(o: OrderRow, actor: AuthUser, status: PaymentStatus, method?: string): OrderRow {
  if (!can(actor, 'payments')) throw forbidden();
  const paidAt = status === 'paid' ? new Date().toISOString() : null;
  db()
    .prepare(
      "UPDATE orders SET payment_status = ?, payment_method = COALESCE(?, payment_method), paid_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .run(status, method ?? null, paidAt, o.id);
  addEvent(o.id, 'payment', `Payment marked ${status} by ${actor.first_name}`, actor.id);
  const updated = getOrder(o.id)!;
  if (status === 'paid' && o.payment_status !== 'paid') {
    const payer = getUser(o.payer_id ?? o.created_by);
    if (payer && payer.role !== 'organizer' && payer.role !== 'helper') {
      notify({ event: 'payment_confirmed', to: [payer], orderId: o.id, vars: orderVars(updated, payer), link: orderLink(updated, payer, 'app') });
    }
  }
  publishOrder(updated);
  return updated;
}

export interface TransitionOptions {
  etaMinutes?: number | null;
  note?: string;
  notify?: boolean;
}

const STATUS_EVENT: Partial<Record<OrderStatus, TemplateKey>> = {
  confirmed: 'order_confirmed',
  declined: 'order_declined',
  picking_up: 'picking_up',
  picked_up: 'picked_up',
  en_route: 'en_route',
  delivered: 'delivered',
};

export function transition(o: OrderRow, actor: AuthUser, to: OrderStatus, opts: TransitionOptions = {}): OrderRow {
  const rel = relation(o, actor);
  const isDispatcher = rel.manage;
  const isDriver = can(actor, 'deliver') && (o.assigned_to === actor.id || (!o.assigned_to && can(actor, 'claim')));
  if (to === 'confirmed' || to === 'declined') {
    if (!isDispatcher) throw forbidden('Only dispatch can accept or decline requests.');
    if (!['requested', 'proposed'].includes(o.status) && !(to === 'confirmed' && FLOW_STATUSES.includes(o.status)))
      throw conflict(`This order is already ${STATUS_LABELS[o.status].toLowerCase()}.`);
  } else if (['picking_up', 'picked_up', 'en_route', 'delivered'].includes(to)) {
    if (!isDispatcher && !isDriver) throw forbidden('This delivery is not assigned to you.');
    if (!FLOW_STATUSES.includes(o.status) && !(o.status === 'requested' && isDispatcher))
      throw conflict(`This order is ${STATUS_LABELS[o.status].toLowerCase()} and can't be moved to ${STATUS_LABELS[to].toLowerCase()}.`);
  } else {
    throw badRequest('Unsupported status change.');
  }

  const now = new Date();
  let etaAt = o.eta_at;
  if (opts.etaMinutes && opts.etaMinutes > 0) etaAt = new Date(now.getTime() + opts.etaMinutes * 60000).toISOString();
  const note = (opts.note ?? '').trim();
  // The person moving it along becomes the driver if nobody was assigned.
  const assignTo = !o.assigned_to && ['picking_up', 'picked_up', 'en_route', 'delivered'].includes(to) ? actor.id : o.assigned_to;

  db()
    .prepare(
      `UPDATE orders SET status = @status, eta_at = @eta, assigned_to = @assigned,
         delivered_at = CASE WHEN @status = 'delivered' THEN @now ELSE delivered_at END,
         delivery_note = CASE WHEN @status = 'delivered' THEN @note ELSE delivery_note END,
         cancel_reason = CASE WHEN @status = 'declined' THEN @note ELSE cancel_reason END,
         updated_at = @now
       WHERE id = @id`,
    )
    .run({ status: to, eta: to === 'delivered' ? null : etaAt, assigned: assignTo, now: now.toISOString(), note: note || null, id: o.id });

  const updated = getOrder(o.id)!;
  const tz = timezone();
  let message = statusLabel(to, o.category);
  if (to === 'en_route' && updated.eta_at) message += ` — ETA ${time12(clockIn(updated.eta_at, tz))}`;
  if (note) message += ` · ${note}`;
  addEvent(o.id, 'status', message, actor.id, to);

  if (opts.notify !== false) {
    const event = STATUS_EVENT[to];
    if (event) notifyCustomers(updated, event, actor.id, { note });
    if (o.surprise !== 'none') {
      if (to === 'en_route' && o.surprise === 'heads_up') notifySurpriseCadet(updated, 'surprise_heads_up', { note: '' });
      if (to === 'delivered') notifySurpriseCadet(updated, 'surprise_delivered', { note: '' });
    }
  }
  publishOrder(updated);
  return updated;
}

export function assign(o: OrderRow, actor: AuthUser, helperId: number | null): OrderRow {
  if (helperId) {
    const h = getUser(helperId);
    if (!h || !(h.role === 'organizer' || (h.role === 'helper' && h.status === 'active'))) throw badRequest('Choose an active team member.');
  }
  db().prepare("UPDATE orders SET assigned_to = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(helperId, o.id);
  const helper = getUser(helperId);
  addEvent(o.id, 'staff', helper ? `Assigned to ${fullName(helper)}` : 'Unassigned', actor.id);
  const updated = getOrder(o.id)!;
  if (helper && helper.id !== actor.id) {
    notify({ event: 'assigned', to: [helper], orderId: o.id, vars: orderVars(updated, helper), link: `/app/orders/${o.id}` });
  }
  publishOrder(o);
  publishOrder(updated);
  return updated;
}

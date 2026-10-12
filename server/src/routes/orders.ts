import { Router } from 'express';
import { z } from 'zod';
import {
  CATEGORIES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  orderInputSchema,
  orderStaffUpdateSchema,
  type OrderStatus,
} from '@cds/shared';
import { db, json, tx } from '../db';
import { can, me, requireActive } from '../lib/auth';
import { badRequest, conflict, forbidden, intParam, parse } from '../lib/http';
import {
  addEvent,
  assign,
  cancelOrder,
  createOrder,
  getOrder,
  listOrders,
  mustGetOrder,
  publishOrder,
  reportPayment,
  respondToProposal,
  setPayment,
  toOrderDTO,
  transition,
  viewable,
  type OrderFilters,
} from '../lib/orders';
import { getSettings } from '../lib/settings';
import { saveAttachment, upload } from '../lib/uploads';

export const orderRoutes = Router();
orderRoutes.use('/orders', requireActive);

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

orderRoutes.get('/orders', (req, res) => {
  const q = req.query;
  const filters: OrderFilters = {
    scope: str(q.scope) as OrderFilters['scope'],
    status: str(q.status),
    date: str(q.date),
    from: str(q.from),
    to: str(q.to),
    q: str(q.q),
    assigned: str(q.assigned),
    payment: str(q.payment),
    runId: q.runId ? Number(q.runId) : undefined,
    cadetId: q.cadetId ? Number(q.cadetId) : undefined,
    limit: q.limit ? Number(q.limit) : undefined,
  };
  res.json(listOrders(me(req), filters));
});

orderRoutes.get('/orders/:id', (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  viewable(o, user);
  res.json(toOrderDTO(o, user, { events: true }));
});

orderRoutes.post('/orders', (req, res) => {
  const user = me(req);
  const input = parse(orderInputSchema, req.body);
  const o = createOrder(input, user);
  res.status(201).json(toOrderDTO(o, user, { events: true }));
});

/** Customers can edit details while a request is still pending; dispatch can edit anything. */
orderRoutes.patch('/orders/:id', (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  const rel = viewable(o, user);
  const input = parse(orderStaffUpdateSchema, req.body);
  const isOwnerEdit = !rel.manage && o.created_by === user.id && ['proposed', 'requested'].includes(o.status);
  if (!rel.manage && !isOwnerEdit) throw forbidden('This order can no longer be edited. Send a message instead.');
  if (isOwnerEdit && (input.feeCents !== undefined || input.assignedTo !== undefined || input.staffNotes !== undefined || input.runId !== undefined)) {
    throw forbidden();
  }

  const sets: string[] = [];
  const params: Record<string, unknown> = { id: o.id };
  const changes: string[] = [];
  const set = (col: string, val: unknown, label?: string) => {
    sets.push(`${col} = @${col}`);
    params[col] = val;
    if (label) changes.push(label);
  };
  if (input.serviceDate && input.serviceDate !== o.service_date) set('service_date', input.serviceDate, 'date');
  if (input.time && input.time !== o.time) set('time', input.time, 'time');
  if (input.locationId !== undefined && input.locationId !== o.location_id) set('location_id', input.locationId, 'location');
  if (input.details) {
    const merged = { ...json<Record<string, unknown>>(o.details, {}), ...input.details };
    const allowed = new Set(CATEGORIES[o.category].fields.map((f) => f.key));
    const clean = Object.fromEntries(Object.entries(merged).filter(([k, v]) => allowed.has(k) && v !== null && v !== ''));
    set('details', JSON.stringify(clean), 'details');
  }
  if (input.notes !== undefined && input.notes !== o.notes) set('notes', input.notes, 'notes');
  if (input.staffNotes !== undefined) set('staff_notes', input.staffNotes);
  if (input.feeCents !== undefined && input.feeCents !== o.fee_cents) set('fee_cents', input.feeCents, 'fee');
  if (input.runId !== undefined && input.runId !== o.run_id) set('run_id', input.runId, 'group run');

  if (sets.length) {
    db().prepare(`UPDATE orders SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`).run(params);
    if (changes.length) addEvent(o.id, rel.manage ? 'staff' : 'edit', `Updated ${changes.join(', ')}`, user.id);
  }
  let updated = getOrder(o.id)!;
  if (input.assignedTo !== undefined && input.assignedTo !== o.assigned_to) updated = assign(updated, user, input.assignedTo);
  else publishOrder(updated);
  res.json(toOrderDTO(updated, user, { events: true }));
});

orderRoutes.post('/orders/:id/respond', (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  viewable(o, user);
  const input = parse(z.object({ accept: z.boolean(), note: z.string().trim().max(500).default('') }), req.body);
  const updated = respondToProposal(o, user, input.accept, input.note);
  res.json(toOrderDTO(updated, user, { events: true }));
});

orderRoutes.post('/orders/:id/cancel', (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  viewable(o, user);
  const { reason } = parse(z.object({ reason: z.string().trim().max(500).default('') }), req.body ?? {});
  const updated = cancelOrder(o, user, reason);
  res.json(toOrderDTO(updated, user, { events: true }));
});

orderRoutes.post('/orders/:id/payment/report', (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  viewable(o, user);
  const input = parse(z.object({ method: z.string().trim().min(1).max(40), reference: z.string().trim().max(120).default('') }), req.body);
  const methods = getSettings('payments').methods;
  const label = methods.find((m) => m.id === input.method)?.label ?? input.method;
  const updated = reportPayment(o, user, label, input.reference);
  res.json(toOrderDTO(updated, user, { events: true }));
});

orderRoutes.post('/orders/:id/payment', (req, res) => {
  const user = me(req);
  if (!can(user, 'payments')) throw forbidden();
  const o = mustGetOrder(intParam(req));
  const input = parse(z.object({ status: z.enum(PAYMENT_STATUSES), method: z.string().trim().max(40).optional() }), req.body);
  const updated = setPayment(o, user, input.status, input.method);
  res.json(toOrderDTO(updated, user, { events: true }));
});

const statusInput = z.object({
  status: z.enum(ORDER_STATUSES),
  etaMinutes: z.number().int().min(1).max(600).nullable().optional(),
  note: z.string().trim().max(500).optional(),
  notify: z.boolean().optional(),
});

orderRoutes.post('/orders/:id/status', (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  viewable(o, user);
  const input = parse(statusInput, req.body);
  const updated = transition(o, user, input.status as OrderStatus, input);
  res.json(toOrderDTO(updated, user, { events: true }));
});

/** Run Mode: move several orders at once ("Leaving now — ETA 20 min" for a whole run). */
orderRoutes.post('/orders/batch-status', (req, res) => {
  const user = me(req);
  const input = statusInput.extend({ ids: z.array(z.number().int().positive()).min(1).max(100) }).parse(req.body);
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const id of input.ids) {
    try {
      const o = mustGetOrder(id);
      viewable(o, user);
      transition(o, user, input.status as OrderStatus, input);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  res.json({ results });
});

orderRoutes.post('/orders/:id/deliver', upload.single('photo'), (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  viewable(o, user);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
  const notifyFlag = req.body?.notify !== 'false';
  if (req.file) saveAttachment(req.file, { orderId: o.id, kind: 'delivery', uploadedBy: user.id });
  const updated = transition(o, user, 'delivered', { note, notify: notifyFlag });
  res.json(toOrderDTO(updated, user, { events: true }));
});

orderRoutes.post('/orders/:id/attachments', upload.single('file'), (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  const rel = viewable(o, user);
  if (rel.redacted) throw forbidden();
  if (!req.file) throw badRequest('Choose a file to upload.');
  const kind = rel.manage || rel.assigned ? (req.body?.kind === 'delivery' ? 'delivery' : 'other') : 'receipt';
  saveAttachment(req.file, { orderId: o.id, kind, uploadedBy: user.id });
  addEvent(o.id, 'edit', kind === 'receipt' ? `${user.first_name} attached a receipt` : `${user.first_name} attached a file`, user.id);
  publishOrder(o);
  res.status(201).json(toOrderDTO(getOrder(o.id)!, user, { events: true }));
});

orderRoutes.post('/orders/:id/claim', (req, res) => {
  const user = me(req);
  const o = mustGetOrder(intParam(req));
  const dto = toOrderDTO(o, user);
  if (!dto.can.claim) throw conflict('This order has already been claimed.');
  const updated = tx(() => {
    const r = db().prepare('UPDATE orders SET assigned_to = ? WHERE id = ? AND assigned_to IS NULL').run(user.id, o.id);
    if (!r.changes) throw conflict('Someone else just claimed this order.');
    addEvent(o.id, 'staff', `Claimed by ${user.first_name}`, user.id);
    return getOrder(o.id)!;
  });
  publishOrder(o);
  res.json(toOrderDTO(updated, user, { events: true }));
});

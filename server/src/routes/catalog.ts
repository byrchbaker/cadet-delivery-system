import { Router } from 'express';
import { z } from 'zod';
import { addDays, locationSchema, runSchema, serviceSchema, todayIn } from '@cds/shared';
import { db } from '../db';
import { me, requireActive, requireOrganizer, requirePerm, can } from '../lib/auth';
import { badRequest, intParam, notFound, parse } from '../lib/http';
import { listLocations, listRuns, listServices } from '../lib/catalog';
import { timezone } from '../lib/settings';
import { broadcast } from '../realtime';

export const catalogRoutes = Router();

catalogRoutes.get('/services', requireActive, (req, res) => {
  res.json(listServices(req.query.all === '1' && can(me(req), 'dispatch')));
});

catalogRoutes.get('/locations', requireActive, (req, res) => {
  res.json(listLocations(req.query.all === '1' && can(me(req), 'dispatch')));
});

catalogRoutes.get('/runs', requireActive, (req, res) => {
  const all = req.query.all === '1' && can(me(req), 'dispatch');
  const from = typeof req.query.from === 'string' ? req.query.from : all ? addDays(todayIn(timezone()), -14) : todayIn(timezone());
  const runs = listRuns({ from, all });
  res.json(all ? runs : runs.filter((r) => r.isOpen));
});

// --- Services (organizer) --------------------------------------------------

catalogRoutes.post('/admin/services', requireOrganizer, (req, res) => {
  const s = parse(serviceSchema, req.body);
  const info = db()
    .prepare('INSERT INTO services (name, category, description, instructions, fee_cents, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(s.name, s.category, s.description, s.instructions, s.feeCents, s.active ? 1 : 0, s.sort);
  broadcast({ type: 'settings' });
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

catalogRoutes.put('/admin/services/:id', requireOrganizer, (req, res) => {
  const id = intParam(req);
  const s = parse(serviceSchema, req.body);
  const r = db()
    .prepare('UPDATE services SET name = ?, category = ?, description = ?, instructions = ?, fee_cents = ?, active = ?, sort = ? WHERE id = ?')
    .run(s.name, s.category, s.description, s.instructions, s.feeCents, s.active ? 1 : 0, s.sort, id);
  if (!r.changes) throw notFound();
  broadcast({ type: 'settings' });
  res.json({ ok: true });
});

catalogRoutes.delete('/admin/services/:id', requireOrganizer, (req, res) => {
  const id = intParam(req);
  const used = db().prepare('SELECT 1 FROM orders WHERE service_id = ? UNION SELECT 1 FROM runs WHERE service_id = ? LIMIT 1').get(id, id);
  if (used) {
    db().prepare('UPDATE services SET active = 0 WHERE id = ?').run(id);
    res.json({ ok: true, archived: true });
  } else {
    db().prepare('DELETE FROM services WHERE id = ?').run(id);
    res.json({ ok: true, archived: false });
  }
  broadcast({ type: 'settings' });
});

// --- Locations (organizer) -------------------------------------------------

catalogRoutes.post('/admin/locations', requireOrganizer, (req, res) => {
  const l = parse(locationSchema, req.body);
  const info = db().prepare('INSERT INTO locations (name, details, active, sort) VALUES (?, ?, ?, ?)').run(l.name, l.details, l.active ? 1 : 0, l.sort);
  broadcast({ type: 'settings' });
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

catalogRoutes.put('/admin/locations/:id', requireOrganizer, (req, res) => {
  const l = parse(locationSchema, req.body);
  const r = db().prepare('UPDATE locations SET name = ?, details = ?, active = ?, sort = ? WHERE id = ?').run(l.name, l.details, l.active ? 1 : 0, l.sort, intParam(req));
  if (!r.changes) throw notFound();
  broadcast({ type: 'settings' });
  res.json({ ok: true });
});

catalogRoutes.delete('/admin/locations/:id', requireOrganizer, (req, res) => {
  const id = intParam(req);
  const used = db().prepare('SELECT 1 FROM orders WHERE location_id = ? LIMIT 1').get(id);
  if (used) db().prepare('UPDATE locations SET active = 0 WHERE id = ?').run(id);
  else db().prepare('DELETE FROM locations WHERE id = ?').run(id);
  broadcast({ type: 'settings' });
  res.json({ ok: true, archived: !!used });
});

// --- Group runs (dispatch) -------------------------------------------------

function runValues(r: z.infer<typeof runSchema>) {
  return {
    title: r.title,
    service_id: r.serviceId,
    vendor: r.vendor,
    run_date: r.runDate,
    pickup_time: r.pickupTime,
    cutoff_at: r.cutoffAt || null,
    location_id: r.locationId ?? null,
    capacity: r.capacity,
    fee_cents: r.feeCents ?? null,
    notes: r.notes,
    status: r.status,
  };
}

catalogRoutes.post('/runs', requirePerm('dispatch'), (req, res) => {
  const r = parse(runSchema, req.body);
  if (!db().prepare('SELECT 1 FROM services WHERE id = ?').get(r.serviceId)) throw badRequest('Choose a service for this run.');
  const info = db()
    .prepare(
      `INSERT INTO runs (title, service_id, vendor, run_date, pickup_time, cutoff_at, location_id, capacity, fee_cents, notes, status)
       VALUES (@title, @service_id, @vendor, @run_date, @pickup_time, @cutoff_at, @location_id, @capacity, @fee_cents, @notes, @status)`,
    )
    .run(runValues(r));
  broadcast({ type: 'runs' });
  res.status(201).json(listRuns({ id: Number(info.lastInsertRowid), all: true })[0]);
});

catalogRoutes.put('/runs/:id', requirePerm('dispatch'), (req, res) => {
  const id = intParam(req);
  const r = parse(runSchema, req.body);
  const result = db()
    .prepare(
      `UPDATE runs SET title = @title, service_id = @service_id, vendor = @vendor, run_date = @run_date, pickup_time = @pickup_time,
       cutoff_at = @cutoff_at, location_id = @location_id, capacity = @capacity, fee_cents = @fee_cents, notes = @notes, status = @status
       WHERE id = @id`,
    )
    .run({ ...runValues(r), id });
  if (!result.changes) throw notFound();
  broadcast({ type: 'runs' });
  res.json(listRuns({ id, all: true })[0]);
});

catalogRoutes.delete('/runs/:id', requirePerm('dispatch'), (req, res) => {
  const id = intParam(req);
  const n = (db().prepare("SELECT COUNT(*) n FROM orders WHERE run_id = ? AND status NOT IN ('declined','cancelled')").get(id) as { n: number }).n;
  if (n > 0) db().prepare("UPDATE runs SET status = 'cancelled' WHERE id = ?").run(id);
  else db().prepare('DELETE FROM runs WHERE id = ?').run(id);
  broadcast({ type: 'runs' });
  res.json({ ok: true, cancelled: n > 0 });
});

/** Copy a run forward (e.g. next week's Tuesday Chick-fil-A run). */
catalogRoutes.post('/runs/:id/duplicate', requirePerm('dispatch'), (req, res) => {
  const id = intParam(req);
  const { weeks } = parse(z.object({ weeks: z.number().int().min(1).max(12).default(1) }), req.body ?? {});
  const src = db().prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!src) throw notFound();
  const created: number[] = [];
  for (let w = 1; w <= weeks; w++) {
    const shift = (d: string | null) => (d ? addDays(d.slice(0, 10), 7 * w) + d.slice(10) : null);
    const cutoff = src.cutoff_at ? new Date(new Date(String(src.cutoff_at)).getTime() + 7 * w * 86400_000).toISOString() : null;
    const info = db()
      .prepare(
        `INSERT INTO runs (title, service_id, vendor, run_date, pickup_time, cutoff_at, location_id, capacity, fee_cents, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      )
      .run(src.title, src.service_id, src.vendor, shift(String(src.run_date)), src.pickup_time, cutoff, src.location_id, src.capacity, src.fee_cents, src.notes);
    created.push(Number(info.lastInsertRowid));
  }
  broadcast({ type: 'runs' });
  res.status(201).json({ created });
});

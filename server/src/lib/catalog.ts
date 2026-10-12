import type { LocationDTO, RunDTO, ServiceDTO } from '@cds/shared';
import { db } from '../db';
import { locationDTO, runIsOpen } from './orders';

interface ServiceRow {
  id: number;
  name: string;
  category: ServiceDTO['category'];
  description: string;
  instructions: string;
  fee_cents: number;
  active: number;
  sort: number;
}

export function serviceDTO(r: ServiceRow): ServiceDTO {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    instructions: r.instructions,
    feeCents: r.fee_cents,
    active: !!r.active,
    sort: r.sort,
  };
}

export function listServices(all = false): ServiceDTO[] {
  const rows = db()
    .prepare(`SELECT * FROM services ${all ? '' : 'WHERE active = 1'} ORDER BY sort, id`)
    .all() as ServiceRow[];
  return rows.map(serviceDTO);
}

export function listLocations(all = false): LocationDTO[] {
  const rows = db()
    .prepare(`SELECT * FROM locations ${all ? '' : 'WHERE active = 1'} ORDER BY sort, id`)
    .all() as { id: number; name: string; details: string; active: number; sort: number }[];
  return rows.map((l) => ({ id: l.id, name: l.name, details: l.details, active: !!l.active, sort: l.sort }));
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
  notes: string;
  status: RunDTO['status'];
  service_name: string;
  service_fee: number;
  order_count: number;
}

export function listRuns(opts: { from?: string; all?: boolean; id?: number } = {}): RunDTO[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.id) {
    where.push('r.id = @id');
    params.id = opts.id;
  }
  if (opts.from) {
    where.push('r.run_date >= @from');
    params.from = opts.from;
  }
  if (!opts.all) where.push("r.status = 'open'");
  const rows = db()
    .prepare(
      `SELECT r.*, s.name service_name, s.fee_cents service_fee,
         (SELECT COUNT(*) FROM orders o WHERE o.run_id = r.id AND o.status NOT IN ('declined','cancelled')) order_count
       FROM runs r JOIN services s ON s.id = r.service_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.run_date, r.pickup_time`,
    )
    .all(params) as RunRow[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    serviceId: r.service_id,
    serviceName: r.service_name,
    vendor: r.vendor,
    runDate: r.run_date,
    pickupTime: r.pickup_time,
    cutoffAt: r.cutoff_at,
    location: locationDTO(r.location_id),
    capacity: r.capacity,
    feeCents: r.fee_cents ?? r.service_fee,
    notes: r.notes,
    status: r.status,
    orderCount: r.order_count,
    isOpen: runIsOpen(r),
  }));
}

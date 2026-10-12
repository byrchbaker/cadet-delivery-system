import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { CLOSED_STATUSES, TRACKER_STEPS, clockIn, statusLabel, time12, time24, trackerIndex, type Category, type OrderStatus } from '@cds/shared';

export function Tracker({ status, category, light }: { status: OrderStatus; category?: Category | null; light?: boolean }) {
  const idx = trackerIndex(status);
  const closed = status === 'declined' || status === 'cancelled';
  return (
    <div className={clsx('tracker', closed && 'closed', light && 'light')} role="img" aria-label={`Status: ${statusLabel(status, category ?? null)}`}>
      {TRACKER_STEPS.map((s, i) => (
        <div key={s} className={clsx('tracker-step', i < idx && 'done', i === idx && (s === 'delivered' ? 'done' : 'current'))}>
          {statusLabel(s, category ?? null)}
        </div>
      ))}
    </div>
  );
}

/** Live countdown to an ETA. */
export function Eta({ etaAt, timezone, status }: { etaAt: string | null; timezone: string; status: OrderStatus }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!etaAt || CLOSED_STATUSES.includes(status)) return null;
  const hhmm = clockIn(etaAt, timezone);
  const mins = Math.round((new Date(etaAt).getTime() - Date.now()) / 60000);
  return (
    <span className="eta-box">
      ETA <span className="mono">{time24(hhmm)}</span>
      <span className="small" style={{ fontWeight: 500 }}>
        {time12(hhmm)} · {mins > 1 ? `about ${mins} min` : mins >= -5 ? 'arriving now' : 'any minute'}
      </span>
    </span>
  );
}

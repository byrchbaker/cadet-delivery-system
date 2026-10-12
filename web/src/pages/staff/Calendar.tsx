import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, todayIn, weekday, type OrderDTO } from '@cds/shared';
import { useOrders, usePublicInfo, useRuns } from '../../lib/queries';
import { Button, PageHeader } from '../../components/ui';

function weekStart(d: string): string {
  return addDays(d, -((weekday(d) + 6) % 7)); // Monday
}

const statusClass = (o: OrderDTO) =>
  o.status === 'requested' || o.status === 'proposed'
    ? 'st-requested'
    : o.status === 'confirmed'
      ? 'st-confirmed'
      : o.status === 'delivered'
        ? 'st-delivered'
        : 'st-progress';

export default function CalendarPage() {
  const { data: info } = usePublicInfo();
  const tz = info?.scheduling.timezone ?? 'America/Denver';
  const today = todayIn(tz);
  const [start, setStart] = useState(() => weekStart(today));
  const end = addDays(start, 6);
  const { data: orders } = useOrders({ from: start, to: end, scope: 'all', limit: 500 });
  const { data: runs } = useRuns(true);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const blackouts = new Map((info?.scheduling.blackouts ?? []).map((b) => [b.date, b.reason]));

  const byDay = useMemo(() => {
    const m = new Map<string, OrderDTO[]>();
    for (const o of orders ?? []) {
      if (o.status === 'cancelled' || o.status === 'declined') continue;
      const list = m.get(o.serviceDate) ?? [];
      list.push(o);
      m.set(o.serviceDate, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return m;
  }, [orders]);

  const monthLabel = new Date(`${start}T12:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <div className="content wide">
      <PageHeader
        eyebrow="Schedule"
        title={monthLabel}
        sub="Requests (amber), confirmed (blue), in progress (violet), delivered (green) and group runs."
        actions={
          <div className="row" style={{ gap: 4 }}>
            <Button iconOnly aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}>
              <ChevronLeft />
            </Button>
            <Button onClick={() => setStart(weekStart(today))}>This week</Button>
            <Button iconOnly aria-label="Next week" onClick={() => setStart(addDays(start, 7))}>
              <ChevronRight />
            </Button>
          </div>
        }
      />
      <div className="week">
        {days.map((d) => {
          const dayRuns = runs?.filter((r) => r.runDate === d && r.status !== 'cancelled') ?? [];
          const list = byDay.get(d) ?? [];
          return (
            <div key={d} className={`week-day ${d === today ? 'today' : ''} ${blackouts.has(d) ? 'blackout' : ''}`}>
              <div className="week-day-head">
                <span className="eyebrow plain" style={{ color: 'inherit' }}>
                  {new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}
                </span>
                <span className="d">{Number(d.slice(8))}</span>
                <span className="spacer" />
                {list.length > 0 && <span className="small muted">{list.length}</span>}
              </div>
              <div className="cal-items">
                {blackouts.has(d) && <div className="small muted" style={{ padding: 4 }}>Closed{blackouts.get(d) ? ` — ${blackouts.get(d)}` : ''}</div>}
                {dayRuns.map((r) => (
                  <Link key={`r${r.id}`} to={`/app/orders?scope=all&runId=${r.id}`} className="cal-item run">
                    <span className="mono strong">{r.pickupTime.replace(':', '')}</span> {r.title}
                    <div className="tiny muted">
                      Group run · {r.orderCount} order{r.orderCount === 1 ? '' : 's'}
                    </div>
                  </Link>
                ))}
                {list
                  .filter((o) => !o.run)
                  .map((o) => (
                    <Link key={o.id} to={`/app/orders/${o.id}`} className={`cal-item ${statusClass(o)}`}>
                      <span className="mono strong">{o.time.replace(':', '')}</span> {o.serviceName}
                      <div className="tiny muted truncate">
                        {o.cadet.lastName}
                        {o.assignedTo ? ` · ${o.assignedTo.firstName}` : ''}
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

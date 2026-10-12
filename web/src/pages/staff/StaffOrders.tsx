import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Gift, PlusCircle, Search, Zap } from 'lucide-react';
import { PAYMENT_LABELS, PAYMENT_STATUSES, money, shortDate, todayIn } from '@cds/shared';
import { useOrders, usePublicInfo, useStaffTeam, type OrderQuery } from '../../lib/queries';
import { ButtonLink, Card, Clock, Empty, LoadingRows, PageHeader, PaymentBadge, Segmented, SelectField, StatusBadge } from '../../components/ui';

type Scope = 'needs' | 'upcoming' | 'today' | 'history' | 'all';

export default function StaffOrders() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: info } = usePublicInfo();
  const { data: team } = useStaffTeam();
  const tz = info?.scheduling.timezone ?? 'America/Denver';
  const scope = (params.get('scope') as Scope) || 'upcoming';
  const [q, setQ] = useState(params.get('q') ?? '');
  const payment = params.get('payment') ?? '';
  const assigned = params.get('assigned') ?? '';
  const runId = Number(params.get('runId')) || undefined;

  const query: OrderQuery = { q: q || undefined, payment: payment || undefined, assigned: assigned || undefined, runId };
  if (scope === 'needs') query.status = 'requested,proposed';
  else if (scope === 'today') query.date = todayIn(tz);
  else if (scope === 'upcoming') query.scope = 'upcoming';
  else if (scope === 'history') query.scope = 'history';
  else query.scope = 'all';
  const { data: orders, isLoading } = useOrders(query);

  const update = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="content wide">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        actions={
          <>
            <a className="btn" href="/api/admin/export/orders.csv" download>
              <Download /> Export CSV
            </a>
            <ButtonLink to="/app/new" variant="primary" icon={<PlusCircle />}>
              Log an order
            </ButtonLink>
          </>
        }
      />
      <div className="stack" style={{ gap: 12, marginBottom: 14 }}>
        <Segmented
          value={scope}
          onChange={(v) => update('scope', v)}
          options={[
            { value: 'needs', label: 'Needs action' },
            { value: 'today', label: 'Today' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'history', label: 'Past' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="grid grid-4 keep-2" style={{ gap: 10 }}>
          <div className="input-group" style={{ gridColumn: 'span 2' }}>
            <span className="addon">
              <Search size={16} />
            </span>
            <input
              className="input"
              placeholder="Search name, order #, store, phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => update('q', q)}
              onKeyDown={(e) => e.key === 'Enter' && update('q', q)}
              aria-label="Search orders"
            />
          </div>
          <SelectField aria-label="Payment" value={payment} onChange={(e) => update('payment', e.target.value)} options={PAYMENT_STATUSES.map((p) => ({ value: p, label: PAYMENT_LABELS[p] }))} placeholder="Any payment" />
          <SelectField
            aria-label="Driver"
            value={assigned}
            onChange={(e) => update('assigned', e.target.value)}
            options={[{ value: 'none', label: 'Unassigned' }, { value: 'me', label: 'Assigned to me' }, ...(team ?? []).map((t) => ({ value: String(t.id), label: `${t.firstName} ${t.lastName}` }))]}
            placeholder="Any driver"
          />
        </div>
      </div>
      <Card pad={false}>
        {isLoading ? (
          <LoadingRows />
        ) : !orders?.length ? (
          <Empty title="No orders match">Try a different filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Order</th>
                  <th>Cadet</th>
                  <th>Status</th>
                  <th>Driver</th>
                  <th className="num">Fee</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/app/orders/${o.id}`)}>
                    <td className="nowrap">
                      <div className="strong">{shortDate(o.serviceDate)}</div>
                      <Clock time={o.time} compact />
                    </td>
                    <td style={{ minWidth: 220 }}>
                      <div className="strong row" style={{ gap: 6 }}>
                        {o.serviceName}
                        {o.surprise !== 'none' && <Gift size={14} color="var(--violet)" />}
                        {o.shortNotice && <Zap size={14} color="var(--warn)" />}
                      </div>
                      <div className="small muted">
                        <span className="mono">#{o.ref}</span> {o.summary && `· ${o.summary}`}
                      </div>
                    </td>
                    <td className="nowrap">
                      {o.cadet.firstName} {o.cadet.lastName}
                      <div className="small muted">{o.cadet.cadet?.squadron}</div>
                    </td>
                    <td>
                      <StatusBadge status={o.status} category={o.category} />
                    </td>
                    <td className="nowrap small">{o.assignedTo ? o.assignedTo.firstName : <span className="faint">—</span>}</td>
                    <td className="num mono">{money(o.totalCents)}</td>
                    <td>{o.totalCents > 0 ? <PaymentBadge status={o.paymentStatus} short /> : <span className="faint small">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

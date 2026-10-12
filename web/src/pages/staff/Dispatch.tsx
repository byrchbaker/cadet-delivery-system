import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, CreditCard, Inbox, Megaphone, Navigation, PlusCircle, Repeat, Truck, UserCheck, Zap } from 'lucide-react';
import { money, shortDate, todayIn, type OrderDTO } from '@cds/shared';
import { post } from '../../lib/api';
import { useAuth, useUser } from '../../lib/auth';
import { useDashboard, useOrders, usePublicInfo } from '../../lib/queries';
import { OrderRow } from '../../components/OrderRow';
import { ButtonLink, Button, Card, Clock, Empty, LoadingRows, PageHeader, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';

export default function Dispatch() {
  const user = useUser();
  const { can } = useAuth();
  const { data: info } = usePublicInfo();
  const tz = info?.scheduling.timezone ?? 'America/Denver';
  const today = todayIn(tz);
  const { data: dash } = useDashboard();
  const { data: requests, isLoading: loadingReq } = useOrders({ status: 'requested' });
  const { data: todays, isLoading: loadingToday } = useOrders({ date: today, status: 'confirmed,picking_up,picked_up,en_route,delivered' });
  const { data: upcoming } = useOrders({ scope: 'upcoming', status: 'confirmed', from: today, limit: 12 });
  const { data: proposed } = useOrders({ status: 'proposed' });
  const c = dash?.counts;

  return (
    <div className="content wide">
      <PageHeader
        eyebrow={`Dispatch · ${shortDate(today)}`}
        title={`Welcome back, ${user.firstName}`}
        actions={
          <>
            <ButtonLink to="/app/new" icon={<PlusCircle />}>
              Log an order
            </ButtonLink>
            <ButtonLink to="/app/run" variant="primary" icon={<Navigation />}>
              Start Run Mode
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-4 keep-2" style={{ marginBottom: 18 }}>
        <Kpi to="#requests" label="New requests" value={c?.requested} note={c?.proposed ? `+${c.proposed} waiting on ${c.proposed === 1 ? 'a cadet' : 'cadets'}` : 'waiting on you'} hot={!!c?.requested} />
        <Kpi to="/app/run" label="Today" value={c?.today} note={c?.inProgress ? `${c.inProgress} in progress` : 'deliveries scheduled'} />
        {can('payments') && <Kpi to="/app/payments" label="Payments to verify" value={c?.paymentsToVerify} note={`${c?.unpaid ?? 0} unpaid overall`} hot={!!c?.paymentsToVerify} />}
        <Kpi to="/app/inbox" label="Unread conversations" value={c?.unreadThreads} note="across text, email & app" hot={!!c?.unreadThreads} />
      </div>

      {(c?.pendingHelpers ?? 0) > 0 && (
        <Link to="/app/team" className="card card-pad row" style={{ marginBottom: 18, borderLeft: '3px solid var(--warn)', textDecoration: 'none', color: 'inherit' }}>
          <UserCheck color="var(--warn)" />
          <span className="strong">
            {c!.pendingHelpers} helper application{c!.pendingHelpers > 1 ? 's' : ''} waiting for your approval
          </span>
          <span className="spacer" />
          <span className="small strong" style={{ color: 'var(--link)' }}>
            Review →
          </span>
        </Link>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} data-collapse>
        <div className="stack" style={{ gap: 18 }}>
          <div id="requests">
            <Card eyebrow="Needs a decision" title="Requests" pad={false} actions={requests?.length ? <span className="badge badge-warn">{requests.length}</span> : undefined}>
              {loadingReq ? (
                <LoadingRows rows={2} />
              ) : requests?.length ? (
                <div className="list">
                  {requests.map((o) => (
                    <RequestRow key={o.id} order={o} />
                  ))}
                </div>
              ) : (
                <Empty icon={<Check />} title="All caught up">
                  New requests appear here the moment they're submitted — and you'll get a text.
                </Empty>
              )}
            </Card>
          </div>

          <Card eyebrow={shortDate(today)} title="Today's deliveries" pad={false} actions={<Link to="/app/run" className="small strong">Run Mode →</Link>}>
            {loadingToday ? (
              <LoadingRows rows={3} />
            ) : todays?.length ? (
              <div className="list">
                {todays.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </div>
            ) : (
              <Empty icon={<Truck />} title="Nothing scheduled today" />
            )}
          </Card>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <Card eyebrow="Shortcuts" title="Quick actions" pad={false}>
            <div className="list">
              <Link to="/app/runs" className="item">
                <Repeat size={18} color="var(--primary)" /> <span className="strong">Schedule a group run</span>
              </Link>
              <Link to="/app/news" className="item">
                <Megaphone size={18} color="var(--primary)" /> <span className="strong">Post an announcement</span>
              </Link>
              <Link to="/app/inbox" className="item">
                <Inbox size={18} color="var(--primary)" /> <span className="strong">Open inbox</span>
              </Link>
              {can('payments') && (
                <Link to="/app/payments" className="item">
                  <CreditCard size={18} color="var(--primary)" /> <span className="strong">Verify payments</span>
                </Link>
              )}
            </div>
          </Card>

          <Card eyebrow="Coming up" title="Confirmed" pad={false}>
            {upcoming?.filter((o) => o.serviceDate > today).length ? (
              <div className="list">
                {upcoming
                  .filter((o) => o.serviceDate > today)
                  .slice(0, 8)
                  .map((o) => (
                    <Link key={o.id} to={`/app/orders/${o.id}`} className="item">
                      <div style={{ width: 86 }} className="small">
                        <div className="strong">{shortDate(o.serviceDate)}</div>
                        <Clock time={o.time} compact />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate strong small">{o.serviceName}</div>
                        <div className="truncate small muted">
                          {o.cadet.firstName} {o.cadet.lastName}
                          {o.assignedTo ? ` · ${o.assignedTo.firstName}` : ' · unassigned'}
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            ) : (
              <Empty title="Nothing confirmed ahead" />
            )}
          </Card>

          {!!proposed?.length && (
            <Card eyebrow="Waiting on cadets" title="Proposed by families" pad={false}>
              <div className="list">
                {proposed.map((o) => (
                  <Link key={o.id} to={`/app/orders/${o.id}`} className="item">
                    <AlertCircle size={16} color="var(--violet)" />
                    <span className="small truncate" style={{ flex: 1 }}>
                      {o.createdBy.firstName} → {o.cadet.firstName}: {o.serviceName}
                    </span>
                    <span className="small muted">{shortDate(o.serviceDate)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {user.role === 'organizer' && dash && (
            <Card eyebrow="Collected" title="Revenue">
              <div className="grid grid-2">
                <div>
                  <div className="small muted">Last 7 days</div>
                  <div className="display mono" style={{ fontSize: 26 }}>
                    {money(dash.revenueWeekCents)}
                  </div>
                </div>
                <div>
                  <div className="small muted">This month</div>
                  <div className="display mono" style={{ fontSize: 26 }}>
                    {money(dash.revenueMonthCents)}
                  </div>
                </div>
              </div>
              <Link to="/app/reports" className="small strong" style={{ display: 'inline-block', marginTop: 10 }}>
                Reports →
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ to, label, value, note, hot }: { to: string; label: string; value?: number; note: string; hot?: boolean }) {
  const content = (
    <>
      <div className="eyebrow">{label}</div>
      <div className="kpi-value">{value ?? '—'}</div>
      <div className="kpi-note">{note}</div>
    </>
  );
  return to.startsWith('#') ? (
    <a href={to} className={`card kpi ${hot ? 'hot alert-tile' : ''}`}>
      {content}
    </a>
  ) : (
    <Link to={to} className={`card kpi ${hot ? 'hot alert-tile' : ''}`}>
      {content}
    </Link>
  );
}

function RequestRow({ order }: { order: OrderDTO }) {
  const qc = useQueryClient();
  const toast = useToast();
  const accept = useMutation({
    mutationFn: () => post<OrderDTO>(`/orders/${order.id}/status`, { status: 'confirmed' }),
    onSuccess: () => {
      toast.ok(`Confirmed — ${order.cadet.firstName}'s family has been notified`);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e),
  });
  const vendor = typeof order.details.vendor === 'string' ? order.details.vendor : null;
  return (
    <div className="item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <Link to={`/app/orders/${order.id}`} className="strong" style={{ color: 'var(--ink)' }}>
          {order.serviceName}
        </Link>
        {order.shortNotice && (
          <span className="badge badge-warn" style={{ marginLeft: 8 }}>
            <Zap size={12} /> Short notice
          </span>
        )}
        <div className="small muted" style={{ marginTop: 2 }}>
          {shortDate(order.serviceDate)} · <Clock time={order.time} compact /> · {order.cadet.firstName} {order.cadet.lastName}
          {vendor && ` · ${vendor}`}
        </div>
        <div className="tiny faint" style={{ marginTop: 2 }}>
          From {order.createdBy.firstName} {order.createdBy.lastName} · <span className="mono">#{order.ref}</span> · {money(order.totalCents)}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <StatusBadge status={order.status} />
        <Button size="sm" variant="primary" icon={<Check />} loading={accept.isPending} onClick={() => accept.mutate()}>
          Accept
        </Button>
        <ButtonLink to={`/app/orders/${order.id}`} size="sm">
          Review
        </ButtonLink>
      </div>
    </div>
  );
}

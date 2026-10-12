import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ChevronLeft, ChevronRight, Hand, MapPin, MessageSquare, Navigation, Package, Phone, ShieldAlert, Store, Timer, User } from 'lucide-react';
import { addDays, shortDate, statusLabel, todayIn, type OrderDTO, type OrderStatus } from '@cds/shared';
import { get, post, qs } from '../../lib/api';
import { useAuth, useUser } from '../../lib/auth';
import { usePublicInfo } from '../../lib/queries';
import { Eta } from '../../components/Tracker';
import { Button, Empty, LoadingRows, PageHeader, Segmented, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';
import { DeliverModal } from '../OrderDetail';

const ETAS = [5, 10, 15, 20, 30, 45];
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { confirmed: 'picking_up', picking_up: 'picked_up', picked_up: 'en_route', en_route: 'delivered' };

export default function RunMode() {
  const user = useUser();
  const { can } = useAuth();
  const { data: info } = usePublicInfo();
  const tz = info?.scheduling.timezone ?? 'America/Denver';
  const [date, setDate] = useState(() => todayIn(tz));
  const dispatcher = can('dispatch');
  const [tab, setTab] = useState<'mine' | 'open' | 'all'>(dispatcher ? 'all' : 'mine');
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [batchEta, setBatchEta] = useState(15);

  const { data: sheet, isLoading } = useQuery({
    queryKey: ['run-sheet', date],
    queryFn: () => get<OrderDTO[]>(`/staff/run-sheet${qs({ date })}`),
    refetchInterval: 60_000,
  });

  const lists = useMemo(() => {
    const all = sheet ?? [];
    return {
      mine: all.filter((o) => o.assignedTo?.id === user.id),
      open: all.filter((o) => !o.assignedTo && o.status !== 'delivered'),
      all,
    };
  }, [sheet, user.id]);
  const list = lists[tab];
  const active = list.filter((o) => o.status !== 'delivered');
  const done = list.filter((o) => o.status === 'delivered');

  const batch = useMutation({
    mutationFn: (status: OrderStatus) => post<{ results: { id: number; ok: boolean; error?: string }[] }>('/orders/batch-status', { ids: selected, status, etaMinutes: batchEta }),
    onSuccess: (r) => {
      const failed = r.results.filter((x) => !x.ok);
      toast.ok(`${r.results.length - failed.length} updated — families notified`);
      if (failed.length) toast.error(`${failed.length} could not be updated: ${failed[0].error}`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['run-sheet'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => toast.error(e),
  });

  const tabs = [
    { value: 'mine' as const, label: 'My run', count: lists.mine.filter((o) => o.status !== 'delivered').length },
    ...(can('claim') || dispatcher ? [{ value: 'open' as const, label: 'Unassigned', count: lists.open.length }] : []),
    ...(dispatcher ? [{ value: 'all' as const, label: 'Everything', count: lists.all.filter((o) => o.status !== 'delivered').length }] : []),
  ];

  return (
    <div className="content">
      <PageHeader
        eyebrow="Run Mode"
        title={date === todayIn(tz) ? "Today's run" : shortDate(date)}
        sub="Every tap sends the update by text and email for you — no typing while you drive."
        actions={
          <div className="row" style={{ gap: 4 }}>
            <Button iconOnly aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft />
            </Button>
            <Button onClick={() => setDate(todayIn(tz))}>Today</Button>
            <Button iconOnly aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <div className="alert alert-warn" style={{ marginBottom: 16 }}>
        <ShieldAlert />
        <div>Tap updates before you pull out or once you're parked. Families get the text automatically.</div>
      </div>

      <div className="row wrap between" style={{ marginBottom: 14 }}>
        <Segmented value={tab} onChange={setTab} options={tabs} />
        {list.length > 0 && (
          <div className="run-progress" style={{ width: 180 }} aria-label={`${done.length} of ${list.length} delivered`}>
            {list.map((o) => (
              <span key={o.id} className={o.status === 'delivered' ? 'on' : ''} />
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="card card-pad accent" style={{ marginBottom: 16, position: 'sticky', top: 66, zIndex: 20 }}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="strong">{selected.length} selected — update them all at once</div>
            <div className="eta-chips">
              {ETAS.slice(0, 4).map((m) => (
                <button key={m} aria-pressed={batchEta === m} onClick={() => setBatchEta(m)}>
                  {m}
                  <small>min</small>
                </button>
              ))}
            </div>
            <div className="grid grid-2" style={{ gap: 8 }}>
              <Button size="lg" loading={batch.isPending && batch.variables === 'picking_up'} onClick={() => batch.mutate('picking_up')}>
                Heading to pickups
              </Button>
              <Button size="lg" variant="primary" loading={batch.isPending && batch.variables === 'en_route'} onClick={() => batch.mutate('en_route')}>
                On the way · {batchEta} min
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card">
          <LoadingRows />
        </div>
      ) : !active.length && !done.length ? (
        <div className="card">
          <Empty icon={<Package />} title={tab === 'open' ? 'Nothing to claim' : 'No deliveries'}>
            {tab === 'mine' ? 'Orders assigned to you — or ones you claim — appear here.' : 'Nothing on the sheet for this day.'}
          </Empty>
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {active.map((o) => (
            <RunCard
              key={o.id}
              order={o}
              tz={tz}
              selected={selected.includes(o.id)}
              onSelect={(v) => setSelected((s) => (v ? [...s, o.id] : s.filter((x) => x !== o.id)))}
            />
          ))}
          {done.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginTop: 10 }}>
                Delivered ({done.length})
              </div>
              {done.map((o) => (
                <Link key={o.id} to={`/app/orders/${o.id}`} className="run-card is-done" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="run-head">
                    <Check color="var(--success)" />
                    <span className="strong">{o.serviceName}</span>
                    <span className="muted small">
                      {o.cadet.firstName} {o.cadet.lastName}
                    </span>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RunCard({ order, tz, selected, onSelect }: { order: OrderDTO; tz: string; selected: boolean; onSelect: (v: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [eta, setEta] = useState<number>(15);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const next = NEXT[order.status];
  const vendor = typeof order.details.vendor === 'string' ? order.details.vendor : null;
  const live = ['picking_up', 'picked_up', 'en_route'].includes(order.status);

  const move = useMutation({
    mutationFn: (input: { status: OrderStatus; etaMinutes?: number }) => post<OrderDTO>(`/orders/${order.id}/status`, input),
    onSuccess: (o) => {
      toast.ok(`${statusLabel(o.status, o.category)} — family notified`);
      qc.invalidateQueries({ queryKey: ['run-sheet'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => toast.error(e),
  });
  const claim = useMutation({
    mutationFn: () => post<OrderDTO>(`/orders/${order.id}/claim`),
    onSuccess: () => {
      toast.ok('Claimed — added to your run');
      qc.invalidateQueries({ queryKey: ['run-sheet'] });
    },
    onError: (e) => toast.error(e),
  });

  const mapsQuery = encodeURIComponent(order.category === 'transport' ? String(order.details.pickupPlace ?? '') : (vendor ?? order.location?.name ?? ''));
  const phone = order.cadet.phone;

  return (
    <div className={`run-card ${live ? 'is-active' : ''}`}>
      <div className="run-head">
        {order.can.deliver && (
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label="Select for batch update" style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} />
        )}
        <div className="run-time">{order.time.replace(':', '')}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Link to={`/app/orders/${order.id}`} className="strong truncate" style={{ display: 'block', color: 'var(--ink)' }}>
            {order.serviceName}
          </Link>
          <div className="small muted mono">#{order.ref}</div>
        </div>
        <StatusBadge status={order.status} category={order.category} />
      </div>
      <div className="run-body">
        {vendor && (
          <div className="run-line">
            <Store />
            <div>
              <strong>{vendor}</strong>
              {(order.details.orderNumber || order.details.orderName) && (
                <div className="small muted">
                  {order.details.orderName && <>Name: <span className="mono">{String(order.details.orderName)}</span></>}
                  {order.details.orderNumber && <> · Order <span className="mono">{String(order.details.orderNumber)}</span></>}
                </div>
              )}
            </div>
          </div>
        )}
        {order.category === 'transport' && (
          <div className="run-line">
            <Navigation />
            <div>
              <strong>{String(order.details.pickupPlace ?? '')}</strong> → {String(order.details.destination ?? '')}
              {order.details.flight && (
                <div className="small muted">
                  {String(order.details.airline ?? '')} {String(order.details.flight)} {order.details.flightTime && `· ${String(order.details.flightTime).replace(':', '')}`}
                </div>
              )}
            </div>
          </div>
        )}
        {typeof order.details.items === 'string' && order.details.items && (
          <div className="run-line">
            <Package />
            <span className="small">{order.details.items}</span>
          </div>
        )}
        <div className="run-line">
          <User />
          <div>
            <strong>
              {order.cadet.firstName} {order.cadet.lastName}
            </strong>
            {order.surprise !== 'none' && <span className="badge badge-violet" style={{ marginLeft: 6 }}>Surprise — don't tell the cadet</span>}
            {order.cadet.cadet?.squadron && <span className="small muted"> · {order.cadet.cadet.squadron}</span>}
          </div>
        </div>
        {order.location && (
          <div className="run-line">
            <MapPin />
            <div>
              <strong>{order.location.name}</strong>
              {order.location.details && <div className="small muted">{order.location.details}</div>}
            </div>
          </div>
        )}
        {order.notes && <div className="small" style={{ background: 'var(--warn-bg)', padding: '8px 10px', borderRadius: 'var(--radius)' }}>{order.notes}</div>}
        <Eta etaAt={order.etaAt} timezone={tz} status={order.status} />
      </div>

      {order.can.claim && (
        <div className="run-actions">
          <Button className="wide" size="xl" variant="primary" icon={<Hand />} loading={claim.isPending} onClick={() => claim.mutate()}>
            Claim this delivery
          </Button>
        </div>
      )}

      {order.can.deliver && (
        <div className="run-actions">
          {(order.status === 'picked_up' || order.status === 'en_route' || order.status === 'picking_up' || order.status === 'confirmed') && next !== 'delivered' && (
            <div className="wide">
              <div className="small muted" style={{ marginBottom: 6 }}>
                <Timer size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Minutes until drop-off
              </div>
              <div className="eta-chips">
                {ETAS.slice(1, 5).map((m) => (
                  <button key={m} aria-pressed={eta === m} onClick={() => setEta(m)}>
                    {m}
                    <small>min</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {next === 'picking_up' && (
            <>
              <Button size="xl" onClick={() => move.mutate({ status: 'picking_up', etaMinutes: eta })} loading={move.isPending}>
                Heading out
              </Button>
              <Button size="xl" variant="primary" onClick={() => move.mutate({ status: 'en_route', etaMinutes: eta })} loading={move.isPending}>
                On the way
              </Button>
            </>
          )}
          {next === 'picked_up' && (
            <>
              <Button size="xl" onClick={() => move.mutate({ status: 'picked_up' })} loading={move.isPending}>
                {statusLabel('picked_up', order.category)}
              </Button>
              <Button size="xl" variant="primary" onClick={() => move.mutate({ status: 'en_route', etaMinutes: eta })} loading={move.isPending}>
                On the way
              </Button>
            </>
          )}
          {next === 'en_route' && (
            <Button className="wide" size="xl" variant="primary" onClick={() => move.mutate({ status: 'en_route', etaMinutes: eta })} loading={move.isPending}>
              On the way · {eta} min
            </Button>
          )}
          {order.status === 'en_route' && (
            <Button size="xl" onClick={() => move.mutate({ status: 'en_route', etaMinutes: eta })} loading={move.isPending}>
              New ETA · {eta}m
            </Button>
          )}
          <Button
            size="xl"
            variant={order.status === 'en_route' ? 'success' : 'secondary'}
            className={order.status === 'en_route' ? '' : 'wide'}
            icon={<Camera />}
            onClick={() => setDeliverOpen(true)}
          >
            Delivered
          </Button>
          <div className="wide row" style={{ gap: 8 }}>
            {mapsQuery && (
              <a className="btn btn-block" href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noreferrer">
                <Navigation /> Navigate
              </a>
            )}
            {phone && (
              <>
                <a className="btn btn-icon" href={`tel:${phone}`} aria-label="Call cadet">
                  <Phone />
                </a>
                <a className="btn btn-icon" href={`sms:${phone}`} aria-label="Text cadet">
                  <MessageSquare />
                </a>
              </>
            )}
          </div>
        </div>
      )}
      <DeliverModal order={order} open={deliverOpen} onClose={() => setDeliverOpen(false)} />
    </div>
  );
}

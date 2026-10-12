import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Gift,
  Hand,
  MapPin,
  Paperclip,
  Pencil,
  Phone,
  Truck,
  User,
  X,
  Zap,
} from 'lucide-react';
import {
  CATEGORIES,
  PAYMENT_LABELS,
  formatPhone,
  money,
  relativeTime,
  shortDate,
  statusLabel,
  type OrderDTO,
  type OrderStatus,
  type PaymentStatus,
} from '@cds/shared';
import { api, patch, post } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { paymentUrl } from '../lib/payments';
import { useCustomerInfo, useLocations, useOrder, usePublicInfo, useStaffTeam } from '../lib/queries';
import { Eta, Tracker } from '../components/Tracker';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Clock,
  Empty,
  LoadingRows,
  Modal,
  PageHeader,
  PaymentBadge,
  SelectField,
  StatusBadge,
  Switch,
  TextArea,
  TextField,
} from '../components/ui';
import { useToast } from '../components/toast';
import { Conversation } from './Inbox';

export function OrderDetail() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const { data: order, isLoading, error } = useOrder(id);
  const { staff } = useAuth();
  const { data: info } = usePublicInfo();
  const tz = info?.scheduling.timezone ?? 'America/Denver';
  // On phones the payment card moves up under the status so families don't scroll past the chat to pay.
  const narrow = useMedia('(max-width: 960px)');

  if (isLoading) return <div className="content"><LoadingRows /></div>;
  if (error || !order) {
    return (
      <div className="content">
        <Empty title="Order not found">It may have been removed, or you don't have access to it.</Empty>
      </div>
    );
  }

  const spec = CATEGORIES[order.category];
  const closed = ['delivered', 'declined', 'cancelled'].includes(order.status);
  const isNew = params.get('new') === '1';
  const showStaff = (order.can.manage && !closed) || order.can.deliver || order.can.claim;

  return (
    <div className="content">
      <PageHeader
        back={{ to: staff ? '/app/orders' : '/app/orders', label: 'Orders' }}
        eyebrow={
          <>
            Order <span className="mono">#{order.ref}</span>
            {order.run && <span>· {order.run.title}</span>}
          </>
        }
        title={
          <span className="row" style={{ gap: 10, display: 'inline-flex' }}>
            {order.serviceName}
            {order.surprise !== 'none' && !order.redacted && staff && <span className="badge badge-violet"><Gift size={12} /> {order.surprise === 'hidden' ? 'Total surprise' : 'Heads-up surprise'}</span>}
          </span>
        }
        sub={
          <>
            For {order.cadet.firstName} {order.cadet.lastName} · {shortDate(order.serviceDate)} · <Clock time={order.time} />
          </>
        }
        actions={<HeaderActions order={order} />}
      />

      {isNew && <NewOrderBanner order={order} />}
      {order.shortNotice && staff && !closed && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="warn" title="Short notice">
            Placed with less lead time than your policy. Accept or decline based on availability.
          </Alert>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} data-collapse>
        <div className="stack" style={{ gap: 18 }}>
          {order.can.respond && <RespondCard order={order} />}

          <Card eyebrow="Status" title={statusLabel(order.status, order.category)} actions={<StatusBadge status={order.status} category={order.category} />}>
            {order.status === 'proposed' ? (
              <Alert tone="info">Waiting for {order.cadet.firstName} to accept. Nothing is sent to the organizer until then.</Alert>
            ) : (
              <>
                <Tracker status={order.status} category={order.category} />
                <div className="tracker-caption">
                  <Eta etaAt={order.etaAt} timezone={tz} status={order.status} />
                  {order.assignedTo && (
                    <span className="small muted row" style={{ gap: 6 }}>
                      <Truck size={15} /> {order.assignedTo.firstName} is delivering
                    </span>
                  )}
                </div>
              </>
            )}
            {order.location && (
              <div className="row top" style={{ marginTop: 16 }}>
                <MapPin size={18} color="var(--muted)" />
                <div>
                  <div className="strong">{order.location.name}</div>
                  {order.location.details && <div className="small muted">{order.location.details}</div>}
                </div>
              </div>
            )}
            {order.deliveryNote && (
              <div style={{ marginTop: 14 }}>
                <Alert tone="success" title="Drop-off note">
                  {order.deliveryNote}
                </Alert>
              </div>
            )}
            <DeliveryPhoto order={order} />
          </Card>

          {narrow && !order.redacted && <PaymentCard order={order} />}
          {showStaff && <StaffControls order={order} />}

          <Card eyebrow={spec.label} title="Details" actions={order.can.edit && <EditButton order={order} />}>
            {order.redacted ? (
              <p className="muted">
                <Gift size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> It's a surprise — details will be revealed when it's delivered.
              </p>
            ) : (
              <dl className="kv">
                {spec.fields
                  .filter((f) => order.details[f.key] !== undefined && order.details[f.key] !== null && order.details[f.key] !== '')
                  .map((f) => (
                    <FragmentKV
                      key={f.key}
                      label={f.label}
                      value={
                        f.type === 'checkbox'
                          ? order.details[f.key]
                            ? 'Yes'
                            : 'No'
                          : f.type === 'select'
                            ? (f.options?.find((o) => o.value === order.details[f.key])?.label ?? String(order.details[f.key]))
                            : String(order.details[f.key])
                      }
                    />
                  ))}
                {order.notes && <FragmentKV label="Notes" value={order.notes} />}
                {order.staffNotes && <FragmentKV label="Staff notes" value={order.staffNotes} />}
              </dl>
            )}
            <Attachments order={order} />
          </Card>

          {order.threadId && (
            <Card eyebrow="Conversation" title="Messages about this order" pad={false}>
              <div style={{ height: 420, display: 'flex', flexDirection: 'column' }}>
                <Conversation threadId={order.threadId} compact />
              </div>
            </Card>
          )}
        </div>

        <div className="stack" style={{ gap: 18 }}>
          {!narrow && !order.redacted && <PaymentCard order={order} />}
          <PeopleCard order={order} />
          {order.events && (
            <Card eyebrow="History" title="Timeline">
              <div className="timeline">
                {[...order.events].reverse().map((e) => (
                  <div key={e.id} className={`tl-item ${e.type}`}>
                    <div className="tl-text">{e.message}</div>
                    <div className="tl-meta">
                      {e.actor ? `${e.actor.firstName} · ` : ''}
                      {new Date(e.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatch(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return match;
}

function FragmentKV({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="pre">{value}</dd>
    </>
  );
}

function useOrderMutation<T>(order: OrderDTO, fn: (input: T) => Promise<OrderDTO>, success?: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (o) => {
      qc.setQueryData(['order', order.id], o);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (success) toast.ok(success);
    },
    onError: (e) => toast.error(e),
  });
}

function NewOrderBanner({ order }: { order: OrderDTO }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Alert tone="success" title={order.status === 'proposed' ? `Sent to ${order.cadet.firstName}` : 'Request sent'}>
        {order.status === 'proposed'
          ? `${order.cadet.firstName} will get a text to accept or decline. You'll be notified either way.`
          : order.can.pay
            ? 'You can pay the delivery fee now or after it is confirmed. You will get a text when it is confirmed.'
            : "You'll get a text as soon as it's confirmed."}
      </Alert>
    </div>
  );
}

function HeaderActions({ order }: { order: OrderDTO }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useOrderMutation(order, () => post<OrderDTO>(`/orders/${order.id}/cancel`, { reason }), 'Order cancelled');
  if (!order.can.cancel) return null;
  return (
    <>
      <Button variant="danger" icon={<X />} onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this order?"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Keep it</Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(undefined, { onSuccess: () => setOpen(false) })}
            >
              Cancel order
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">Everyone involved will be notified. {order.status === 'confirmed' && 'If the store order is already placed, cancel it with the store too.'}</p>
          <TextArea label="Reason" optional value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}

function RespondCard({ order }: { order: OrderDTO }) {
  const [note, setNote] = useState('');
  const respond = useOrderMutation(order, (accept: boolean) => post<OrderDTO>(`/orders/${order.id}/respond`, { accept, note }));
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--violet)' }}>
      <div className="card-body stack">
        <div className="row" style={{ gap: 10 }}>
          <Gift color="var(--violet)" />
          <div className="strong">
            {order.createdBy.firstName} set this up for you — want it?
          </div>
        </div>
        <p className="small muted">Accepting sends it to the organizer to confirm. Declining lets {order.createdBy.firstName} know so they can pick another time.</p>
        <TextField placeholder={`Optional note to ${order.createdBy.firstName}`} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row">
          <Button variant="primary" icon={<Check />} loading={respond.isPending && respond.variables === true} onClick={() => respond.mutate(true)}>
            Accept
          </Button>
          <Button icon={<X />} loading={respond.isPending && respond.variables === false} onClick={() => respond.mutate(false)}>
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeliveryPhoto({ order }: { order: OrderDTO }) {
  const photo = [...order.attachments].reverse().find((a) => a.kind === 'delivery' && a.mime.startsWith('image/'));
  if (!photo) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Proof of delivery
      </div>
      <a href={photo.url} target="_blank" rel="noreferrer" className="photo-proof" style={{ display: 'block' }}>
        <img src={photo.url} alt="Delivery drop-off" />
      </a>
    </div>
  );
}

function Attachments({ order }: { order: OrderDTO }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const files = order.attachments.filter((a) => a.kind !== 'delivery');
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const o = await api<OrderDTO>(`/orders/${order.id}/attachments`, { form });
      qc.setQueryData(['order', order.id], o);
      toast.ok('Attached');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  if (order.redacted) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="eyebrow">Receipts & screenshots</div>
        {!['cancelled', 'declined'].includes(order.status) && (
          <>
            <Button size="sm" icon={<Paperclip />} loading={busy} onClick={() => input.current?.click()}>
              Attach
            </Button>
            <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </>
        )}
      </div>
      {files.length ? (
        <div className="thumbs">
          {files.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="thumb" title={a.name}>
              {a.mime.startsWith('image/') ? <img src={a.url} alt={a.name} /> : <span><FileText /> PDF</span>}
            </a>
          ))}
        </div>
      ) : (
        <p className="help">Attach the store's order screenshot so the driver can match it at pickup.</p>
      )}
    </div>
  );
}

function PaymentCard({ order }: { order: OrderDTO }) {
  const { can } = useAuth();
  const { data: info } = useCustomerInfo();
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const toast = useToast();
  const report = useOrderMutation(order, () => post<OrderDTO>(`/orders/${order.id}/payment/report`, { method, reference }), 'Thanks — payment sent for verification');
  const setStatus = useOrderMutation(order, (status: PaymentStatus) => post<OrderDTO>(`/orders/${order.id}/payment`, { status }), 'Payment updated');
  const methods = (info?.payments.methods ?? []).filter((m) => m.url || m.details);

  if (order.totalCents === 0 && !can('payments')) return null;

  return (
    <Card eyebrow="Payment" title={<span className="mono">{money(order.totalCents)}</span>} actions={<PaymentBadge status={order.paymentStatus} />}>
      <div className="stack" style={{ gap: 12 }}>
        {order.tipCents > 0 && (
          <div className="small muted">
            {money(order.feeCents)} delivery + {money(order.tipCents)} tip
          </div>
        )}
        {order.paymentMethod && (
          <div className="small">
            Sent via <strong>{order.paymentMethod}</strong>
            {order.paymentRef && <span className="muted"> · ref {order.paymentRef}</span>}
          </div>
        )}
        {order.can.pay && (
          <>
            {info?.payments.instructions && <p className="small muted pre">{info.payments.instructions}</p>}
            {methods.length === 0 && <p className="small muted">Payment options will appear here once the organizer adds them.</p>}
            <div className="stack" style={{ gap: 8 }}>
              {methods.map((m) => (
                <div key={m.id} className="row" style={{ gap: 8 }}>
                  {m.url ? (
                    <a className="btn btn-block" href={paymentUrl(m.url, order)} target="_blank" rel="noreferrer" onClick={() => setMethod(m.id)}>
                      <CreditCard /> Pay with {m.label} <ExternalLink size={14} />
                    </a>
                  ) : (
                    <div className="card inset" style={{ padding: '8px 12px', flex: 1 }}>
                      <div className="strong small">{m.label}</div>
                      <div className="small mono">{m.details}</div>
                    </div>
                  )}
                  {m.details && m.url === '' && (
                    <Button
                      iconOnly
                      aria-label={`Copy ${m.label} details`}
                      onClick={() => {
                        void navigator.clipboard?.writeText(m.details);
                        setMethod(m.id);
                        toast.ok('Copied');
                      }}
                    >
                      <Copy />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {methods.length > 0 && (
              <div className="card inset" style={{ padding: 14 }}>
                <div className="stack" style={{ gap: 10 }}>
                  <div className="strong small">Already sent it? Let us know:</div>
                  <SelectField aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} options={methods.map((m) => ({ value: m.id, label: m.label }))} placeholder="Payment method" />
                  <TextField aria-label="Payment note" placeholder="Name or note on the payment (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
                  <Button variant="primary" disabled={!method} loading={report.isPending} onClick={() => report.mutate(undefined)}>
                    I've sent {money(order.totalCents)}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {order.can.verifyPayment && (
          <div className="row wrap" style={{ gap: 8 }}>
            <Button variant="success" size="sm" icon={<CheckCircle2 />} loading={setStatus.isPending} onClick={() => setStatus.mutate('paid')}>
              Mark paid
            </Button>
            <Button size="sm" onClick={() => setStatus.mutate('waived')}>
              Waive
            </Button>
          </div>
        )}
        {can('payments') && ['paid', 'waived'].includes(order.paymentStatus) && (
          <Button size="sm" variant="ghost" onClick={() => setStatus.mutate('unpaid')}>
            Reset to unpaid
          </Button>
        )}
        {order.paymentStatus === 'reported' && !order.can.verifyPayment && <p className="small muted">{PAYMENT_LABELS.reported}.</p>}
      </div>
    </Card>
  );
}

function PeopleCard({ order }: { order: OrderDTO }) {
  const { staff } = useAuth();
  const user = useUser();
  const rows = [
    { label: 'Cadet', p: order.cadet, extra: [order.cadet.cadet?.squadron, order.cadet.cadet?.dorm].filter(Boolean).join(' · ') },
    order.createdBy.id !== order.cadet.id && order.createdBy.id !== 0 ? { label: 'Placed by', p: order.createdBy, extra: '' } : null,
    order.payer && order.payer.id !== order.createdBy.id ? { label: 'Paying', p: order.payer, extra: '' } : null,
  ].filter(Boolean) as { label: string; p: OrderDTO['cadet']; extra: string }[];
  return (
    <Card eyebrow="People" title="Who's involved" pad={false}>
      <div className="list">
        {rows.map((r) => (
          <div key={r.label} className="item">
            <Avatar first={r.p.firstName} last={r.p.lastName} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="small muted">{r.label}</div>
              <div className="strong truncate">
                {staff && r.p.role !== 'organizer' ? <Link to={`/app/people/${r.p.id}`}>{r.p.firstName} {r.p.lastName}</Link> : `${r.p.firstName} ${r.p.lastName}`}
                {r.p.id === user.id && <span className="muted"> (you)</span>}
              </div>
              {r.extra && <div className="small muted">{r.extra}</div>}
            </div>
            {r.p.phone && (staff || user.role === 'parent') && (
              <a className="btn btn-sm btn-icon" href={`tel:${r.p.phone}`} aria-label={`Call ${formatPhone(r.p.phone)}`} title={formatPhone(r.p.phone)}>
                <Phone />
              </a>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Staff controls

const ETA_CHOICES = [5, 10, 15, 20, 30, 45];

function StaffControls({ order }: { order: OrderDTO }) {
  const { can } = useAuth();
  const { data: team } = useStaffTeam(order.can.manage);
  const [notify, setNotify] = useState(true);
  const [eta, setEta] = useState<number | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState('');

  const move = useOrderMutation(order, (input: { status: OrderStatus; etaMinutes?: number | null; note?: string }) =>
    post<OrderDTO>(`/orders/${order.id}/status`, { ...input, notify }),
  );
  const claim = useOrderMutation(order, () => post<OrderDTO>(`/orders/${order.id}/claim`), 'Claimed — it is on your run sheet');
  const assign = useOrderMutation(order, (assignedTo: number | null) => patch<OrderDTO>(`/orders/${order.id}`, { assignedTo }), 'Driver updated');

  const s = order.status;
  return (
    <Card eyebrow="Dispatch" title="Update this order" className="accent">
      <div className="stack" style={{ gap: 16 }}>
        {order.can.claim && (
          <Button variant="primary" icon={<Hand />} loading={claim.isPending} onClick={() => claim.mutate(undefined)}>
            Claim this delivery
          </Button>
        )}

        {(s === 'requested' || s === 'proposed') && order.can.manage && (
          <div className="row wrap">
            <Button variant="primary" icon={<Check />} loading={move.isPending} onClick={() => move.mutate({ status: 'confirmed' })}>
              Accept request
            </Button>
            <Button variant="danger" icon={<X />} onClick={() => setDeclineOpen(true)}>
              Decline
            </Button>
          </div>
        )}

        {order.can.deliver && (
          <>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                ETA to drop-off
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                {ETA_CHOICES.map((m) => (
                  <button key={m} className="chip" aria-pressed={eta === m} onClick={() => setEta(eta === m ? null : m)}>
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-2" style={{ gap: 8 }}>
              <Button disabled={s !== 'confirmed'} onClick={() => move.mutate({ status: 'picking_up', etaMinutes: eta })}>
                {statusLabel('picking_up', order.category)}
              </Button>
              <Button disabled={!['confirmed', 'picking_up'].includes(s)} onClick={() => move.mutate({ status: 'picked_up' })}>
                {statusLabel('picked_up', order.category)}
              </Button>
              <Button variant={s === 'picked_up' ? 'primary' : 'secondary'} disabled={!['confirmed', 'picking_up', 'picked_up', 'en_route'].includes(s)} onClick={() => move.mutate({ status: 'en_route', etaMinutes: eta ?? 15 })}>
                {s === 'en_route' ? 'Update ETA' : statusLabel('en_route', order.category)} {eta ? `· ${eta}m` : ''}
              </Button>
              <Button variant="success" icon={<Camera />} onClick={() => setDeliverOpen(true)}>
                {statusLabel('delivered', order.category)}
              </Button>
            </div>
            <Switch checked={notify} onChange={setNotify} label="Text & email the family" description="Turn off to update quietly (e.g. fixing a mistake)." />
          </>
        )}

        {order.can.manage && team && !['delivered', 'cancelled', 'declined'].includes(s) && (
          <SelectField
            label="Driver"
            value={order.assignedTo?.id ?? ''}
            onChange={(e) => assign.mutate(Number(e.target.value) || null)}
            options={team.map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}${t.role === 'organizer' ? ' (organizer)' : ''}` }))}
            placeholder="Unassigned — any helper can claim"
          />
        )}
        {!order.can.manage && !can('dispatch') && order.assignedTo && <p className="small muted">Assigned to {order.assignedTo.firstName}.</p>}
      </div>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline request"
        footer={
          <>
            <Button onClick={() => setDeclineOpen(false)}>Back</Button>
            <Button
              variant="danger"
              loading={move.isPending}
              onClick={() => move.mutate({ status: 'declined', note: declineNote }, { onSuccess: () => setDeclineOpen(false) })}
            >
              Decline and notify
            </Button>
          </>
        }
      >
        <TextArea label="Message to the family" value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} placeholder="Sorry — I'm fully booked Friday. Could Saturday at 1800 work?" />
      </Modal>
      <DeliverModal order={order} open={deliverOpen} onClose={() => setDeliverOpen(false)} notify={notify} />
    </Card>
  );
}

export function DeliverModal({ order, open, onClose, notify = true }: { order: Pick<OrderDTO, 'id' | 'location' | 'category'>; open: boolean; onClose: () => void; notify?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      if (photo) form.append('photo', photo);
      form.append('note', note);
      form.append('notify', String(notify));
      const o = await api<OrderDTO>(`/orders/${order.id}/deliver`, { form });
      qc.setQueryData(['order', order.id], o);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['run-sheet'] });
      toast.ok('Delivered — family notified');
      setPhoto(null);
      setNote('');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark delivered"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="success" loading={busy} onClick={submit} icon={<Check />}>
            Delivered
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <button className="choice" style={{ justifyContent: 'center', padding: 22 }} onClick={() => input.current?.click()}>
          {photo ? (
            <span className="row">
              <Camera /> {photo.name} <span className="muted small">— tap to retake</span>
            </span>
          ) : (
            <span className="row">
              <Camera /> Take a drop-off photo
            </span>
          )}
        </button>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        <div className="row wrap" style={{ gap: 6 }}>
          {['On the delivery shelf', 'Handed to cadet', 'Labeled with name', 'Left at front desk'].map((n) => (
            <button key={n} className="chip" aria-pressed={note === n} onClick={() => setNote(n)}>
              {n}
            </button>
          ))}
        </div>
        <TextField label="Note" optional value={note} onChange={(e) => setNote(e.target.value)} placeholder={order.location ? `e.g. Top shelf at ${order.location.name}` : ''} />
      </div>
    </Modal>
  );
}

function EditButton({ order }: { order: OrderDTO }) {
  const [open, setOpen] = useState(false);
  const { data: locations } = useLocations();
  const spec = CATEGORIES[order.category];
  const [f, setF] = useState(() => ({
    serviceDate: order.serviceDate,
    time: order.time,
    locationId: order.location?.id ?? null,
    details: { ...order.details },
    notes: order.notes,
    staffNotes: order.staffNotes ?? '',
    fee: (order.feeCents / 100).toFixed(2),
  }));
  const save = useOrderMutation(
    order,
    () =>
      patch<OrderDTO>(`/orders/${order.id}`, {
        serviceDate: f.serviceDate,
        time: f.time,
        locationId: f.locationId,
        details: f.details,
        notes: f.notes,
        ...(order.can.manage ? { staffNotes: f.staffNotes, feeCents: Math.round(Number(f.fee) * 100) } : {}),
      }),
    'Saved',
  );
  return (
    <>
      <Button size="sm" icon={<Pencil />} onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit order"
        width={620}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setOpen(false) })}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <TextField label="Date" type="date" value={f.serviceDate} onChange={(e) => setF({ ...f, serviceDate: e.target.value })} />
          <TextField label={spec.timeLabel} type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          {order.category !== 'transport' && (
            <SelectField
              label="Deliver to"
              wrapClass="full"
              value={f.locationId ?? ''}
              onChange={(e) => setF({ ...f, locationId: Number(e.target.value) || null })}
              options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
            />
          )}
          {spec.fields
            .filter((fld) => fld.type !== 'checkbox')
            .map((fld) => (
              <TextField
                key={fld.key}
                label={fld.label}
                wrapClass={fld.half ? undefined : 'full'}
                type={fld.type === 'date' || fld.type === 'time' || fld.type === 'number' ? fld.type : 'text'}
                value={String(f.details[fld.key] ?? '')}
                onChange={(e) => setF({ ...f, details: { ...f.details, [fld.key]: e.target.value } })}
              />
            ))}
          <TextArea label="Notes" wrapClass="full" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          {order.can.manage && (
            <>
              <TextField label="Delivery fee ($)" type="number" step="0.01" min="0" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
              <TextArea label="Staff notes" help="Only visible to your team." wrapClass="full" value={f.staffNotes} onChange={(e) => setF({ ...f, staffNotes: e.target.value })} />
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

export function CustomerSummary({ order }: { order: OrderDTO }) {
  return (
    <div className="row small muted" style={{ gap: 12 }}>
      <span className="row" style={{ gap: 4 }}>
        <User size={14} /> {order.cadet.firstName} {order.cadet.lastName}
      </span>
      {order.shortNotice && (
        <span className="row" style={{ gap: 4, color: 'var(--warn)' }}>
          <Zap size={14} /> Short notice
        </span>
      )}
      <span>{relativeTime(order.createdAt)}</span>
    </div>
  );
}

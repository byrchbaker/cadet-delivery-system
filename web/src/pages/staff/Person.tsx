import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, KeyRound, Mail, MessageSquare, Phone, PlusCircle, RotateCcw, Trash2 } from 'lucide-react';
import { formatPhone, shortDate, todayIn, addDays, type OrderDTO, type ThreadDTO, type UserDTO } from '@cds/shared';
import { del, get, patch, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePublicInfo } from '../../lib/queries';
import { OrderRow } from '../../components/OrderRow';
import { Avatar, Button, ButtonLink, Card, Empty, LoadingRows, Modal, PageHeader, TextArea, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';

interface Detail {
  user: UserDTO;
  family: UserDTO[];
  orders: OrderDTO[];
  subscriptions: { id: number; label: string; starts_on: string; ends_on: string; notes: string }[];
}

export default function PersonPage() {
  const id = Number(useParams().id);
  const { organizer, can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['person', id], queryFn: () => get<Detail>(`/staff/people/${id}`) });
  const [notes, setNotes] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState('');
  const [subOpen, setSubOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['person', id] });
  const update = useMutation({ mutationFn: (body: Record<string, unknown>) => patch(`/staff/people/${id}`, body), onSuccess: () => { refresh(); toast.ok('Saved'); }, onError: (e) => toast.error(e) });
  const reset = useMutation({ mutationFn: () => post<{ url: string }>(`/staff/people/${id}/reset-link`), onSuccess: (r) => setResetUrl(r.url), onError: (e) => toast.error(e) });
  const message = async () => {
    const t = await post<ThreadDTO>('/threads/direct', { userId: id });
    navigate(`/app/inbox/${t.id}`);
  };
  const removeSub = useMutation({ mutationFn: (sid: number) => del(`/staff/subscriptions/${sid}`), onSuccess: refresh });

  if (isLoading || !data) return <div className="content"><LoadingRows /></div>;
  const u = data.user;
  return (
    <div className="content">
      <PageHeader
        back={{ to: '/app/people', label: 'People' }}
        eyebrow={u.role === 'cadet' ? 'Cadet' : 'Family'}
        title={
          <span className="row" style={{ gap: 12, display: 'inline-flex' }}>
            <Avatar first={u.firstName} last={u.lastName} size="lg" />
            {u.firstName} {u.lastName}
          </span>
        }
        actions={
          <>
            {can('inbox') && (
              <Button icon={<MessageSquare />} onClick={message}>
                Message
              </Button>
            )}
            {u.role === 'cadet' && (
              <ButtonLink to={`/app/new?cadet=${u.id}`} variant="primary" icon={<PlusCircle />}>
                Log order
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr)', gap: 18, alignItems: 'start' }} data-collapse>
        <div className="stack" style={{ gap: 18 }}>
          <Card eyebrow="Contact" title="Details">
            <dl className="kv">
              <dt>Phone</dt>
              <dd>{u.phone ? <a href={`tel:${u.phone}`}><Phone size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {formatPhone(u.phone)}</a> : '—'}</dd>
              <dt>Email</dt>
              <dd>{u.email ? <a href={`mailto:${u.email}`}><Mail size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {u.email}</a> : '—'}</dd>
              {u.cadet && (
                <>
                  <dt>Class</dt>
                  <dd>{u.cadet.classYear || '—'}</dd>
                  <dt>Squadron</dt>
                  <dd>{u.cadet.squadron || '—'}</dd>
                  <dt>Dorm</dt>
                  <dd>{u.cadet.dorm || '—'}</dd>
                </>
              )}
              <dt>Account</dt>
              <dd>{u.managed ? 'No login yet' : 'Active login'}{u.status === 'suspended' && ' · deactivated'}</dd>
              <dt>Texts / email</dt>
              <dd>
                {u.notifySms ? 'Texts on' : 'Texts off'} · {u.notifyEmail ? 'Email on' : 'Email off'}
              </dd>
              <dt>Joined</dt>
              <dd>{new Date(u.createdAt).toLocaleDateString()}</dd>
            </dl>
            {organizer && (
              <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
                {u.email && (
                  <Button size="sm" icon={<KeyRound />} loading={reset.isPending} onClick={() => reset.mutate()}>
                    {u.managed ? 'Account setup link' : 'Password reset link'}
                  </Button>
                )}
                {u.status === 'suspended' ? (
                  <Button size="sm" icon={<RotateCcw />} onClick={() => update.mutate({ status: 'active' })}>
                    Reactivate
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" icon={<Ban />} onClick={() => confirm(`Deactivate ${u.firstName}? They will be signed out and stop receiving messages.`) && update.mutate({ status: 'suspended' })}>
                    Deactivate
                  </Button>
                )}
              </div>
            )}
            {resetUrl && (
              <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                <div className="small muted">Send this link to {u.firstName} (valid 72 hours):</div>
                <input className="input mono small" readOnly value={resetUrl} onFocus={(e) => e.target.select()} />
              </div>
            )}
          </Card>
          <Card eyebrow={u.role === 'cadet' ? 'Family' : 'Cadets'} title="Linked" pad={false}>
            {data.family.length ? (
              <div className="list">
                {data.family.map((f) => (
                  <Link key={f.id} to={`/app/people/${f.id}`} className="item">
                    <Avatar first={f.firstName} last={f.lastName} size="sm" />
                    <div>
                      <div className="strong">
                        {f.firstName} {f.lastName}
                      </div>
                      <div className="small muted">{formatPhone(f.phone)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="No one linked" />
            )}
          </Card>
          {u.role === 'cadet' && can('payments') && (
            <Card
              eyebrow="Billing"
              title="Subscriptions"
              pad={false}
              actions={
                <Button size="sm" onClick={() => setSubOpen(true)}>
                  Add
                </Button>
              }
            >
              {data.subscriptions.length ? (
                <div className="list">
                  {data.subscriptions.map((s) => (
                    <div key={s.id} className="item">
                      <div style={{ flex: 1 }}>
                        <div className="strong">{s.label}</div>
                        <div className="small muted">
                          {shortDate(s.starts_on)} – {shortDate(s.ends_on)}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" iconOnly aria-label="Remove" onClick={() => removeSub.mutate(s.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card-body small muted">Subscribers' orders are automatically marked as covered — no payment needed.</div>
              )}
            </Card>
          )}
          {organizer && (
            <Card eyebrow="Private" title="Staff notes">
              <TextArea value={notes ?? u.note ?? ''} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, preferences, gate instructions… only your team sees this." />
              {notes !== null && (
                <Button size="sm" variant="primary" style={{ marginTop: 10 }} onClick={() => update.mutate({ staffNotes: notes })}>
                  Save notes
                </Button>
              )}
            </Card>
          )}
        </div>
        <Card eyebrow="History" title="Orders" pad={false}>
          {data.orders.length ? (
            <div className="list">
              {data.orders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </div>
          ) : (
            <Empty title="No orders yet" />
          )}
        </Card>
      </div>
      {subOpen && <SubscriptionModal cadetId={id} onClose={() => setSubOpen(false)} onDone={refresh} />}
    </div>
  );
}

function SubscriptionModal({ cadetId, onClose, onDone }: { cadetId: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: info } = usePublicInfo();
  const today = todayIn(info?.scheduling.timezone ?? 'America/Denver');
  const [f, setF] = useState({ label: 'Semester subscription', startsOn: today, endsOn: addDays(today, 120), notes: '' });
  const save = useMutation({
    mutationFn: () => post('/staff/subscriptions', { cadetId, ...f }),
    onSuccess: () => {
      onDone();
      toast.ok('Subscription added');
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title="Add subscription" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Add</Button></>}>
      <div className="form-grid">
        <TextField label="Label" wrapClass="full" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <TextField label="Starts" type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} />
        <TextField label="Ends" type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} />
        <TextField label="Notes" wrapClass="full" optional value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Paid via Zelle 8/20" />
      </div>
    </Modal>
  );
}

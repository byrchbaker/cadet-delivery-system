import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Bell,
  Building2,
  CalendarClock,
  CreditCard,
  Database,
  ListChecks,
  MapPin,
  MessageSquareText,
  Palette,
  Plus,
  Send,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import {
  CATEGORIES,
  CATEGORY_KEYS,
  money,
  type AppearanceSettings,
  type ListsSettings,
  type LocationDTO,
  type PaymentSettings,
  type ProfileSettings,
  type ProviderSettings,
  type RegistrationSettings,
  type SchedulingSettings,
  type ServiceDTO,
} from '@cds/shared';
import { ApiError, del, get, post, put } from '../../lib/api';
import { useLocations, useServices } from '../../lib/queries';
import { THEMES } from '../../lib/theme';
import { Alert, Button, Card, Empty, Modal, PageHeader, SelectField, Switch, TextArea, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { TemplatesTab } from './Templates';
import { OutboxTab } from './Outbox';

export interface AdminSettings {
  profile: ProfileSettings;
  scheduling: SchedulingSettings;
  payments: PaymentSettings;
  lists: ListsSettings;
  appearance: AppearanceSettings;
  registration: RegistrationSettings;
  providers: ProviderSettings;
  providerStatus: { email: string; sms: string; inboundSmsUrl: string };
}

export const useAdminSettings = () => useQuery({ queryKey: ['admin-settings'], queryFn: () => get<AdminSettings>('/admin/settings') });

export function useSaveSection(section: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (value: unknown) => put(`/admin/settings/${section}`, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['public-info'] });
      qc.invalidateQueries({ queryKey: ['customer-info'] });
      toast.ok('Saved');
    },
    onError: (e) => toast.error(e),
  });
}

const TABS: { id: string; label: string; icon: typeof Building2 }[] = [
  { id: 'business', label: 'Business', icon: Building2 },
  { id: 'services', label: 'Services & prices', icon: ShoppingBag },
  { id: 'locations', label: 'Drop-off points', icon: MapPin },
  { id: 'scheduling', label: 'Scheduling', icon: CalendarClock },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'notifications', label: 'Message templates', icon: Bell },
  { id: 'messaging', label: 'Text & email setup', icon: MessageSquareText },
  { id: 'lists', label: 'Cadet lists', icon: ListChecks },
  { id: 'access', label: 'Sign-up & look', icon: Palette },
  { id: 'outbox', label: 'Outbox', icon: Send },
  { id: 'data', label: 'Backups & data', icon: Database },
];

export default function SettingsPage() {
  const tab = useParams().tab ?? 'business';
  const [params] = useSearchParams();
  const { data } = useAdminSettings();
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <div className="content wide">
      <PageHeader eyebrow="Settings" title={current.label} />
      {params.get('welcome') === '1' && (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="success" title="You're set up">
            Fill in your business details, add payment links under Payments, and connect texting under Text & email setup. Then share your site link with families.
          </Alert>
        </div>
      )}
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map((t) => (
            <NavLink key={t.id} to={`/app/settings/${t.id}`} className={({ isActive }) => (isActive ? 'active' : '')}>
              <t.icon /> {t.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          {!data ? (
            <Card>
              <div className="spinner" />
            </Card>
          ) : (
            <>
              {tab === 'business' && <BusinessTab s={data} />}
              {tab === 'services' && <ServicesTab />}
              {tab === 'locations' && <LocationsTab />}
              {tab === 'scheduling' && <SchedulingTab s={data} />}
              {tab === 'payments' && <PaymentsTab s={data} />}
              {tab === 'notifications' && <TemplatesTab />}
              {tab === 'messaging' && <MessagingTab s={data} />}
              {tab === 'lists' && <ListsTab s={data} />}
              {tab === 'access' && <AccessTab s={data} />}
              {tab === 'outbox' && <OutboxTab />}
              {tab === 'data' && <DataTab />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveBar({ onSave, busy, children }: { onSave: () => void; busy: boolean; children?: ReactNode }) {
  return (
    <div className="row" style={{ marginTop: 18 }}>
      <Button variant="primary" loading={busy} onClick={onSave}>
        Save changes
      </Button>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BusinessTab({ s }: { s: AdminSettings }) {
  const [f, setF] = useState(s.profile);
  const save = useSaveSection('profile');
  const set = (k: keyof ProfileSettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Card eyebrow="Shown to families" title="Business details">
      <div className="form-grid">
        <TextField label="Business name" value={f.businessName} onChange={set('businessName')} />
        <TextField label="Tagline" value={f.tagline} onChange={set('tagline')} placeholder="Everyday needs, delivered to your cadet." help="Headline on your home page." />
        <TextField label="Organizer name" value={f.ownerName} onChange={set('ownerName')} />
        <TextField label="Contact phone" type="tel" value={f.phone} onChange={set('phone')} help="Shown on tracking pages." />
        <TextField label="Contact email" type="email" value={f.email} onChange={set('email')} />
        <TextField label="Facebook page" value={f.facebookUrl} onChange={set('facebookUrl')} placeholder="https://facebook.com/…" />
        <TextArea label="Package shipping address" wrapClass="full" value={f.packageAddress} onChange={set('packageAddress')} help="Only shown to signed-in families when they choose a package delivery." rows={3} />
        <TextField label="Service area" wrapClass="full" value={f.serviceArea} onChange={set('serviceArea')} placeholder="e.g. Monument to northeast Colorado Springs" />
        <TextField label="Hours" wrapClass="full" value={f.hours} onChange={set('hours')} placeholder="Deliveries most days 1700–2000. Midday by request." />
        <TextArea label="About" wrapClass="full" value={f.about} onChange={set('about')} rows={4} />
        <TextField
          label="Site address"
          wrapClass="full"
          value={f.siteUrl}
          onChange={set('siteUrl')}
          placeholder="https://delivery.example.com"
          help="Used for links inside texts and emails. Leave blank if set by your host (APP_URL)."
        />
      </div>
      <SaveBar busy={save.isPending} onSave={() => save.mutate(f)} />
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ServicesTab() {
  const { data: services } = useServices(true);
  const [editing, setEditing] = useState<ServiceDTO | 'new' | null>(null);
  return (
    <Card
      eyebrow="Catalog"
      title="Services & prices"
      pad={false}
      actions={
        <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing('new')}>
          Add service
        </Button>
      }
    >
      {!services?.length ? (
        <Empty title="No services yet" action={<Button variant="primary" onClick={() => setEditing('new')}>Add your first service</Button>}>
          Each service has a category (which decides what questions families are asked) and a delivery fee.
        </Empty>
      ) : (
        <div className="list">
          {CATEGORY_KEYS.flatMap((c) => services.filter((s) => s.category === c)).map((s) => (
            <button key={s.id} className="item" onClick={() => setEditing(s)} style={{ opacity: s.active ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong">
                  {s.name} {!s.active && <span className="badge badge-outline">Hidden</span>}
                </div>
                <div className="small muted truncate">
                  {CATEGORIES[s.category].label} · {s.description}
                </div>
              </div>
              <span className="mono strong">{money(s.feeCents)}</span>
            </button>
          ))}
        </div>
      )}
      {editing && <ServiceModal service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ServiceModal({ service, onClose }: { service: ServiceDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    name: service?.name ?? '',
    category: service?.category ?? 'food',
    description: service?.description ?? '',
    instructions: service?.instructions ?? '',
    fee: service ? (service.feeCents / 100).toFixed(2) : '20.00',
    active: service?.active ?? true,
    sort: service?.sort ?? 0,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['services'] });
    qc.invalidateQueries({ queryKey: ['public-info'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name, category: f.category, description: f.description, instructions: f.instructions, feeCents: Math.round(Number(f.fee) * 100), active: f.active, sort: Number(f.sort) || 0 };
      return service ? put(`/admin/services/${service.id}`, body) : post('/admin/services', body);
    },
    onSuccess: () => {
      refresh();
      toast.ok('Service saved');
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: () => del<{ archived: boolean }>(`/admin/services/${service!.id}`),
    onSuccess: (r) => {
      refresh();
      toast.ok(r.archived ? 'Hidden (it has past orders)' : 'Deleted');
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={service ? 'Edit service' : 'New service'}
      width={620}
      footer={
        <>
          {service && (
            <Button variant="danger" icon={<Trash2 />} style={{ marginRight: 'auto' }} onClick={() => confirm('Remove this service?') && remove.mutate()}>
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label="Name" wrapClass="full" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <SelectField
          label="Category"
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value as ServiceDTO['category'] })}
          options={CATEGORY_KEYS.map((c) => ({ value: c, label: CATEGORIES[c].plural }))}
          help={`Asks for: ${CATEGORIES[f.category].fields.map((x) => x.label.toLowerCase()).join(', ')}`}
        />
        <TextField label="Delivery fee ($)" type="number" step="0.01" min="0" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
        <TextField label="Short description" wrapClass="full" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <TextArea label="Instructions for families" wrapClass="full" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} help="Shown while they fill in the order — e.g. 'Choose bottled drinks', 'Add bags'." />
        <TextField label="Sort order" type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} />
        <div style={{ alignSelf: 'end' }}>
          <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Offered to families" />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function LocationsTab() {
  const { data: locations } = useLocations(true);
  const [editing, setEditing] = useState<LocationDTO | 'new' | null>(null);
  return (
    <Card
      eyebrow="Where orders go"
      title="Drop-off points"
      pad={false}
      actions={
        <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setEditing('new')}>
          Add location
        </Button>
      }
    >
      {!locations?.length ? (
        <Empty title="No drop-off points yet">Add the places you deliver to, like a delivery shelf or an entry control point.</Empty>
      ) : (
        <div className="list">
          {locations.map((l) => (
            <button key={l.id} className="item" onClick={() => setEditing(l)} style={{ opacity: l.active ? 1 : 0.55 }}>
              <MapPin size={18} color="var(--muted)" />
              <div style={{ flex: 1 }}>
                <div className="strong">{l.name}</div>
                <div className="small muted">{l.details}</div>
              </div>
              {!l.active && <span className="badge badge-outline">Hidden</span>}
            </button>
          ))}
        </div>
      )}
      {editing && <LocationModal location={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function LocationModal({ location, onClose }: { location: LocationDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ name: location?.name ?? '', details: location?.details ?? '', active: location?.active ?? true, sort: location?.sort ?? 0 });
  const done = () => {
    qc.invalidateQueries({ queryKey: ['locations'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => (location ? put(`/admin/locations/${location.id}`, f) : post('/admin/locations', f)),
    onSuccess: () => {
      toast.ok('Saved');
      done();
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({ mutationFn: () => del(`/admin/locations/${location!.id}`), onSuccess: done });
  return (
    <Modal
      open
      onClose={onClose}
      title={location ? 'Edit drop-off point' : 'New drop-off point'}
      footer={
        <>
          {location && (
            <Button variant="danger" icon={<Trash2 />} style={{ marginRight: 'auto' }} onClick={() => remove.mutate()}>
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextField label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <TextArea label="Directions" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} help="Shown to families and drivers." />
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Available" />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function SchedulingTab({ s }: { s: AdminSettings }) {
  const [f, setF] = useState(s.scheduling);
  const [bDate, setBDate] = useState('');
  const [bReason, setBReason] = useState('');
  const { data: locations } = useLocations();
  const save = useSaveSection('scheduling');
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Card eyebrow="Rules" title="Ordering rules">
        <div className="form-grid">
          <TextField label="Minimum notice (hours)" type="number" min={0} value={f.minLeadHours} onChange={(e) => setF({ ...f, minLeadHours: Number(e.target.value) })} help="Orders sooner than this are flagged as short notice." />
          <TextField label="Max orders per day" type="number" min={0} value={f.maxPerDay} onChange={(e) => setF({ ...f, maxPerDay: Number(e.target.value) })} help="0 = no limit. Group runs don't count." />
          <TextField label="Usual delivery window — from" type="time" value={f.windowStart} onChange={(e) => setF({ ...f, windowStart: e.target.value })} />
          <TextField label="to" type="time" value={f.windowEnd} onChange={(e) => setF({ ...f, windowEnd: e.target.value })} />
          <TextField label="Day-before reminders at (hour, 0–23)" type="number" min={0} max={23} value={f.reminderHour} onChange={(e) => setF({ ...f, reminderHour: Number(e.target.value) })} />
          <TextField label="Time zone" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} help="IANA name, e.g. America/Denver" />
          <SelectField
            label="Default drop-off point"
            value={f.defaultLocationId ?? ''}
            onChange={(e) => setF({ ...f, defaultLocationId: Number(e.target.value) || null })}
            options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
            placeholder="First in list"
          />
          <div className="full">
            <Switch checked={f.allowShortNotice} onChange={(v) => setF({ ...f, allowShortNotice: v })} label="Accept short-notice requests" description="When off, orders inside the minimum notice are blocked instead of flagged." />
          </div>
        </div>
        <SaveBar busy={save.isPending} onSave={() => save.mutate(f)} />
      </Card>
      <Card eyebrow="Closed days" title="Blackout dates">
        <div className="stack">
          <p className="small muted">Families can't book these days — useful for holiday weekends or when Arnold Hall is closed.</p>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <TextField label="Date" type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} />
            <TextField label="Reason" value={bReason} onChange={(e) => setBReason(e.target.value)} placeholder="Holiday weekend" wrapClass="spacer" />
            <Button
              disabled={!bDate}
              onClick={() => {
                const next = { ...f, blackouts: [...f.blackouts.filter((b) => b.date !== bDate), { date: bDate, reason: bReason }].sort((a, b) => a.date.localeCompare(b.date)) };
                setF(next);
                save.mutate(next);
                setBDate('');
                setBReason('');
              }}
            >
              Add
            </Button>
          </div>
          {f.blackouts.length > 0 && (
            <div className="list card flat">
              {f.blackouts.map((b) => (
                <div key={b.date} className="item">
                  <span className="mono">{b.date}</span>
                  <span style={{ flex: 1 }}>{b.reason}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    aria-label="Remove"
                    onClick={() => {
                      const next = { ...f, blackouts: f.blackouts.filter((x) => x.date !== b.date) };
                      setF(next);
                      save.mutate(next);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

const METHOD_PRESETS = [
  { label: 'Venmo', url: 'https://venmo.com/?txn=pay&recipients=YOUR-HANDLE&amount={amount}&note={note}', details: '' },
  { label: 'PayPal', url: 'https://paypal.me/YOUR-HANDLE/{amount}', details: '' },
  { label: 'Cash App', url: 'https://cash.app/$YOUR-TAG/{amount}', details: '' },
  { label: 'Zelle', url: '', details: '' },
];

function PaymentsTab({ s }: { s: AdminSettings }) {
  const [f, setF] = useState(s.payments);
  const save = useSaveSection('payments');
  const update = (i: number, patch: Partial<PaymentSettings['methods'][number]>) => setF({ ...f, methods: f.methods.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Card eyebrow="Delivery fees" title="How families pay you">
        <div className="stack" style={{ gap: 14 }}>
          <Alert tone="info">
            Links can include <code className="mono">{'{amount}'}</code>, <code className="mono">{'{note}'}</code> and <code className="mono">{'{ref}'}</code> — they're filled in for each order so families
            don't have to type the amount. Methods without a link (like Zelle) show your details with a copy button.
          </Alert>
          {f.methods.map((m, i) => (
            <div key={m.id} className="card inset" style={{ padding: 14 }}>
              <div className="form-grid">
                <TextField label="Name" value={m.label} onChange={(e) => update(i, { label: e.target.value })} />
                <div style={{ alignSelf: 'end' }}>
                  <Switch checked={m.enabled} onChange={(v) => update(i, { enabled: v })} label="Show to families" />
                </div>
                <TextField label="Payment link" wrapClass="full" value={m.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://…" className="mono small" />
                <TextField label="Details to copy" wrapClass="full" value={m.details} onChange={(e) => update(i, { details: e.target.value })} placeholder="Name and phone for Zelle" />
              </div>
              <Button size="sm" variant="ghost" icon={<Trash2 />} style={{ marginTop: 8 }} onClick={() => setF({ ...f, methods: f.methods.filter((_, j) => j !== i) })}>
                Remove
              </Button>
            </div>
          ))}
          <div className="row wrap" style={{ gap: 6 }}>
            {METHOD_PRESETS.map((p) => (
              <Button key={p.label} size="sm" icon={<Plus />} onClick={() => setF({ ...f, methods: [...f.methods, { id: `${p.label.toLowerCase().replace(/\W/g, '')}-${Date.now().toString(36)}`, label: p.label, url: p.url, details: p.details, enabled: true }] })}>
                {p.label}
              </Button>
            ))}
            <Button size="sm" icon={<Plus />} onClick={() => setF({ ...f, methods: [...f.methods, { id: `m-${Date.now().toString(36)}`, label: 'Other', url: '', details: '', enabled: true }] })}>
              Other
            </Button>
          </div>
          <Switch checked={f.allowTips} onChange={(v) => setF({ ...f, allowTips: v })} label="Let families add a tip" />
          <TextArea label="Payment instructions" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="Please include your cadet's last name in the payment note." />
        </div>
        <SaveBar busy={save.isPending} onSave={() => save.mutate(f)} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MessagingTab({ s }: { s: AdminSettings }) {
  const [f, setF] = useState(s.providers);
  const save = useSaveSection('providers');
  const toast = useToast();
  const [to, setTo] = useState({ sms: '', email: '' });
  const test = useMutation({
    mutationFn: (channel: 'sms' | 'email') => post<{ ok: boolean; skipped?: boolean; error?: string }>('/admin/test-notification', { channel, to: to[channel] || undefined }),
    onSuccess: (r, channel) => (r.ok ? toast.ok(`Test ${channel === 'sms' ? 'text' : 'email'} sent`) : toast.error(r.error ?? 'Failed')),
    onError: (e) => toast.error(e),
  });
  const status = (v: string) =>
    v === 'environment' ? <span className="badge badge-success">Configured by host</span> : v === 'configured' ? <span className="badge badge-success">Connected</span> : <span className="badge badge-warn">Not set up</span>;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Alert tone="info" title="Why this matters">
        Once texting is connected, every confirmation, ETA and delivery update goes out automatically — and when families reply to a text, it lands in your Inbox. Until then,
        messages are kept in the Outbox so nothing is lost.
      </Alert>
      <Card eyebrow="SMS" title="Text messages (Twilio)" actions={status(s.providerStatus.sms)}>
        <div className="stack" style={{ gap: 14 }}>
          <Switch checked={f.sms.enabled} onChange={(v) => setF({ ...f, sms: { ...f.sms, enabled: v } })} label="Send text messages" />
          <div className="form-grid">
            <TextField label="Account SID" value={f.sms.accountSid} onChange={(e) => setF({ ...f, sms: { ...f.sms, accountSid: e.target.value } })} className="mono" />
            <TextField label="Auth token" type="password" value={f.sms.authToken} onChange={(e) => setF({ ...f, sms: { ...f.sms, authToken: e.target.value } })} />
            <TextField label="From number" value={f.sms.fromNumber} onChange={(e) => setF({ ...f, sms: { ...f.sms, fromNumber: e.target.value } })} placeholder="+17195550123" />
            <TextField label="Messaging service SID" optional value={f.sms.messagingServiceSid} onChange={(e) => setF({ ...f, sms: { ...f.sms, messagingServiceSid: e.target.value } })} />
          </div>
          <div className="small">
            <strong>Replies:</strong> in Twilio, set your number's “A message comes in” webhook to <code className="mono">{s.providerStatus.inboundSmsUrl}</code>
          </div>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <TextField label="Send a test to" value={to.sms} onChange={(e) => setTo({ ...to, sms: e.target.value })} placeholder="Your mobile (blank = profile)" />
            <Button icon={<Send />} loading={test.isPending && test.variables === 'sms'} onClick={() => test.mutate('sms')}>
              Send test text
            </Button>
          </div>
        </div>
      </Card>
      <Card eyebrow="Email" title="Email (SMTP)" actions={status(s.providerStatus.email)}>
        <div className="stack" style={{ gap: 14 }}>
          <Switch checked={f.email.enabled} onChange={(v) => setF({ ...f, email: { ...f.email, enabled: v } })} label="Send email" />
          <p className="small muted">Works with Gmail (use an app password), Outlook, or any email provider's SMTP settings.</p>
          <div className="form-grid">
            <TextField label="SMTP server" value={f.email.host} onChange={(e) => setF({ ...f, email: { ...f.email, host: e.target.value } })} placeholder="smtp.gmail.com" />
            <TextField label="Port" type="number" value={f.email.port} onChange={(e) => setF({ ...f, email: { ...f.email, port: Number(e.target.value) } })} />
            <TextField label="Username" value={f.email.user} onChange={(e) => setF({ ...f, email: { ...f.email, user: e.target.value } })} />
            <TextField label="Password / app password" type="password" value={f.email.pass} onChange={(e) => setF({ ...f, email: { ...f.email, pass: e.target.value } })} />
            <TextField label="From address" value={f.email.from} onChange={(e) => setF({ ...f, email: { ...f.email, from: e.target.value } })} placeholder="you@example.com" />
            <div style={{ alignSelf: 'end' }}>
              <Switch checked={f.email.secure} onChange={(v) => setF({ ...f, email: { ...f.email, secure: v } })} label="Use SSL (port 465)" />
            </div>
          </div>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <TextField label="Send a test to" value={to.email} onChange={(e) => setTo({ ...to, email: e.target.value })} placeholder="Email (blank = yours)" />
            <Button icon={<Send />} loading={test.isPending && test.variables === 'email'} onClick={() => test.mutate('email')}>
              Send test email
            </Button>
          </div>
        </div>
      </Card>
      <div>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(f)}>
          Save text & email settings
        </Button>
        <span className="small muted" style={{ marginLeft: 10 }}>
          Save before sending a test.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ListsTab({ s }: { s: AdminSettings }) {
  const toText = (a: string[]) => a.join('\n');
  const [f, setF] = useState({ classYears: toText(s.lists.classYears), squadrons: toText(s.lists.squadrons), dorms: toText(s.lists.dorms) });
  const save = useSaveSection('lists');
  const split = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
  return (
    <Card eyebrow="Pick-lists" title="Classes, squadrons & dorms">
      <p className="small muted" style={{ marginBottom: 14 }}>
        One per line. These power the drop-downs on cadet profiles and let you target announcements by class. Update the classes each summer.
      </p>
      <div className="grid grid-3">
        <TextArea label="Class years" rows={10} value={f.classYears} onChange={(e) => setF({ ...f, classYears: e.target.value })} />
        <TextArea label="Squadrons" rows={10} value={f.squadrons} onChange={(e) => setF({ ...f, squadrons: e.target.value })} />
        <TextArea label="Dormitories" rows={10} value={f.dorms} onChange={(e) => setF({ ...f, dorms: e.target.value })} />
      </div>
      <SaveBar busy={save.isPending} onSave={() => save.mutate({ classYears: split(f.classYears), squadrons: split(f.squadrons), dorms: split(f.dorms) })} />
    </Card>
  );
}

function AccessTab({ s }: { s: AdminSettings }) {
  const [reg, setReg] = useState(s.registration);
  const [look, setLook] = useState(s.appearance);
  const saveReg = useSaveSection('registration');
  const saveLook = useSaveSection('appearance');
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Card eyebrow="Accounts" title="Who can sign up">
        <div className="stack" style={{ gap: 16 }}>
          <Switch checked={reg.openSignup} onChange={(v) => setReg({ ...reg, openSignup: v })} label="Open sign-up for families and cadets" description="When off, people need an invite link from a family member." />
          <Switch checked={reg.helperApplications} onChange={(v) => setReg({ ...reg, helperApplications: v })} label="Accept helper applications" description="Applicants wait for your approval before they can see anything." />
        </div>
        <SaveBar busy={saveReg.isPending} onSave={() => saveReg.mutate(reg)} />
      </Card>
      <Card eyebrow="Appearance" title="Default theme">
        <div className="grid grid-3" style={{ gap: 10 }}>
          {THEMES.map((t) => (
            <button key={t.id} className="choice" aria-pressed={look.theme === t.id} onClick={() => setLook({ ...look, theme: t.id })} style={{ flexDirection: 'column' }}>
              <span className="row" style={{ gap: 0, width: '100%', height: 34, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <span style={{ flex: 2, height: '100%', background: t.swatch[0] }} />
                <span style={{ flex: 1, height: '100%', background: t.swatch[1] }} />
              </span>
              <span className="choice-title">{t.label}</span>
              <span className="choice-sub">{t.description}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Switch checked={look.allowUserTheme} onChange={(v) => setLook({ ...look, allowUserTheme: v })} label="Let each person pick their own theme" />
        </div>
        <SaveBar busy={saveLook.isPending} onSave={() => saveLook.mutate(look)} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DataTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['backups'], queryFn: () => get<{ dir: string; keep: number; files: { name: string; size: number }[] }>('/admin/backups') });
  const create = useMutation({
    mutationFn: () => post<{ name: string }>('/admin/backups'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      toast.ok('Backup created');
    },
    onError: (e) => toast.error((e as ApiError).message),
  });
  const totalKb = useMemo(() => Math.round((data?.files.reduce((s, f) => s + f.size, 0) ?? 0) / 1024), [data]);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Card eyebrow="Safety net" title="Backups">
        <div className="stack">
          <p className="small muted">
            A backup is saved automatically every night at 0300 and the last {data?.keep ?? 14} are kept on the server. Download one now and then to keep a copy somewhere else
            (e.g. Google Drive).
          </p>
          <div className="row wrap">
            <a className="btn btn-primary" href="/api/admin/backup" download>
              <Archive /> Download full backup
            </a>
            <Button loading={create.isPending} onClick={() => create.mutate()}>
              Save a backup on the server now
            </Button>
          </div>
          {!!data?.files.length && (
            <div className="list card flat">
              {data.files.map((f) => (
                <div key={f.name} className="item small">
                  <span className="mono" style={{ flex: 1 }}>
                    {f.name}
                  </span>
                  <span className="muted">{Math.round(f.size / 1024)} KB</span>
                </div>
              ))}
              <div className="item tiny muted">
                {data.files.length} backups · {totalKb} KB · stored in {data.dir}
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card eyebrow="Spreadsheets" title="Export">
        <p className="small muted" style={{ marginBottom: 12 }}>
          All orders as a CSV file — opens in Excel or Google Sheets.
        </p>
        <a className="btn" href="/api/admin/export/orders.csv" download>
          Download orders.csv
        </a>
      </Card>
    </div>
  );
}

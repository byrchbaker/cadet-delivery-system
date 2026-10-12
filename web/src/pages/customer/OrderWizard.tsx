import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, EyeOff, Gift, Info, MessageCircleQuestion, Search, UserPlus, Users, Zap } from 'lucide-react';
import {
  CATEGORIES,
  CATEGORY_KEYS,
  addDays,
  money,
  shortDate,
  time12,
  todayIn,
  zonedToUtc,
  type FieldSpec,
  type OrderDTO,
  type RunDTO,
  type ServiceDTO,
  type SurpriseMode,
  type UserDTO,
} from '@cds/shared';
import { ApiError, get, post, qs } from '../../lib/api';
import { useAuth, useUser } from '../../lib/auth';
import { useCustomerInfo, useFamily, useLocations, usePublicInfo, useRuns, useServices } from '../../lib/queries';
import { CATEGORY_ICONS } from '../public/Landing';
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  Clock,
  DateBlock,
  Empty,
  Field,
  PageHeader,
  SelectField,
  TextArea,
  TextField,
} from '../../components/ui';
import { useToast } from '../../components/toast';

type Details = Record<string, string | number | boolean | null>;

const STEPS = ['Service', 'Recipient', 'Details', 'Review'] as const;

export function OrderWizard() {
  const user = useUser();
  const { staff, can } = useAuth();
  const isStaff = staff && can('dispatch');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: info } = usePublicInfo();
  const { data: services } = useServices();
  const { data: runs } = useRuns();
  const { data: locations } = useLocations();
  const { data: family } = useFamily(!isStaff);
  const { data: customer } = useCustomerInfo();
  const tz = info?.scheduling.timezone ?? 'America/Denver';
  const sched = info?.scheduling;

  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [cadetId, setCadetId] = useState<number | null>(user.role === 'cadet' ? user.id : null);
  const [staffCadet, setStaffCadet] = useState<UserDTO | null>(null);
  const [payer, setPayer] = useState<'me' | 'family'>('me');
  const [payerId, setPayerId] = useState<number | null>(null);
  const [surprise, setSurprise] = useState<SurpriseMode>('none');
  const [askCadet, setAskCadet] = useState(false);
  const [details, setDetails] = useState<Details>({});
  const [serviceDate, setServiceDate] = useState('');
  const [time, setTime] = useState('');
  const [locationId, setLocationId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [tipCents, setTipCents] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const service = services?.find((s) => s.id === serviceId) ?? null;
  const run = runs?.find((r) => r.id === runId) ?? null;
  const spec = service ? CATEGORIES[service.category] : null;
  const fee = run ? run.feeCents : (service?.feeCents ?? 0);

  // Defaults: earliest date that respects lead time, the start of the delivery window, the first location.
  useEffect(() => {
    if (!sched || serviceDate) return;
    const start = sched.windowStart || '17:00';
    let d = addDays(todayIn(tz), 1);
    for (let i = 0; i < 60; i++) {
      const ok = (zonedToUtc(d, start, tz).getTime() - Date.now()) / 3_600_000 >= sched.minLeadHours;
      if (ok && !sched.blackouts.some((b) => b.date === d)) break;
      d = addDays(d, 1);
    }
    setServiceDate(d);
    setTime(start);
  }, [sched, tz, serviceDate]);
  useEffect(() => {
    if (locationId === null && locations?.length) setLocationId(locations[0].id);
  }, [locations, locationId]);

  // Deep links: ?run=, ?service=, ?cadet=
  useEffect(() => {
    const r = Number(params.get('run'));
    const s = Number(params.get('service'));
    const c = Number(params.get('cadet'));
    if (r && runs) {
      const found = runs.find((x) => x.id === r);
      if (found) chooseRun(found);
    } else if (s && services) {
      const found = services.find((x) => x.id === s);
      if (found) chooseService(found);
    }
    if (c) setCadetId(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, services]);

  // Pre-fill "name on order" with CADET LASTNAME.
  const cadetRow = useMemo(() => {
    if (user.role === 'cadet') return user;
    if (isStaff) return staffCadet;
    return family?.cadets.find((c) => c.id === cadetId) ?? null;
  }, [user, family, cadetId, isStaff, staffCadet]);
  useEffect(() => {
    if (!spec || !cadetRow) return;
    if (spec.fields.some((f) => f.key === 'orderName') && !details.orderName) {
      setDetails((d) => ({ ...d, orderName: `CADET ${cadetRow.lastName.toUpperCase()}` }));
    }
    if (spec.fields.some((f) => f.key === 'bagLabel') && !details.bagLabel) {
      setDetails((d) => ({ ...d, bagLabel: `${cadetRow.firstName} ${cadetRow.lastName}` }));
    }
  }, [spec, cadetRow, details.orderName, details.bagLabel]);

  function chooseService(s: ServiceDTO) {
    setServiceId(s.id);
    setRunId(null);
    setDetails({});
    setErrors({});
    setStep(1);
  }
  function chooseRun(r: RunDTO) {
    setRunId(r.id);
    setServiceId(r.serviceId);
    setDetails(r.vendor ? { vendor: r.vendor } : {});
    setServiceDate(r.runDate);
    setTime(r.pickupTime);
    if (r.location) setLocationId(r.location.id);
    setErrors({});
    setStep(1);
  }

  const leadHours = useMemo(() => {
    if (!serviceDate || !time) return null;
    return (zonedToUtc(serviceDate, time, tz).getTime() - Date.now()) / 3_600_000;
  }, [serviceDate, time, tz]);
  const blackout = !run && serviceDate ? sched?.blackouts.find((b) => b.date === serviceDate) : undefined;

  const selectedCadetManaged = cadetRow?.managed ?? false;

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!cadetId) e.cadetId = 'Choose who this is for';
      if (user.role === 'cadet' && payer === 'family' && !payerId) e.payerId = 'Choose who should pay';
    }
    if (s === 2 && spec) {
      for (const f of spec.fields) if (f.required && (details[f.key] === undefined || details[f.key] === '' || details[f.key] === null)) e[`details.${f.key}`] = `${f.label} is required`;
      if (!run) {
        if (!serviceDate) e.serviceDate = 'Pick a date';
        if (!time) e.time = 'Pick a time';
        if (leadHours !== null && leadHours < 0 && !isStaff) e.serviceDate = 'That time has already passed';
        if (blackout && !isStaff) e.serviceDate = `Unavailable${blackout.reason ? ` — ${blackout.reason}` : ''}`;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => validateStep(step) && setStep((s) => Math.min(s + 1, 3));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const submit = useMutation({
    mutationFn: () =>
      post<OrderDTO>('/orders', {
        serviceId,
        runId,
        cadetId,
        serviceDate,
        time,
        locationId: service?.category === 'transport' ? null : locationId,
        details,
        notes,
        surprise,
        askCadet,
        payer,
        payerId: payer === 'family' ? payerId : null,
        tipCents,
      }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.ok(o.status === 'proposed' ? `Sent to ${o.cadet.firstName} to confirm` : 'Request sent');
      navigate(`/app/orders/${o.id}?new=1`);
    },
    onError: (err) => {
      const f = (err as ApiError).fields ?? {};
      setErrors(f);
      if (Object.keys(f).some((k) => k.startsWith('details') || k === 'serviceDate' || k === 'time')) setStep(2);
      else if (Object.keys(f).some((k) => k === 'cadetId' || k === 'payerId')) setStep(1);
      toast.error(err);
    },
  });

  const openRuns = runs?.filter((r) => r.isOpen) ?? [];

  return (
    <div className="content narrow">
      <PageHeader eyebrow={isStaff ? 'Log an order' : 'New order'} title={step === 0 ? 'What do you need?' : service?.name ?? 'New order'} back={{ to: isStaff ? '/app/dispatch' : '/app/home', label: 'Cancel' }} />

      <div className="steps" role="list">
        {STEPS.map((label, i) => (
          <button key={label} role="listitem" className={`step ${i < step ? 'done' : ''} ${i === step ? 'current' : ''}`} onClick={() => i < step && setStep(i)} disabled={i >= step}>
            <span>
              {i + 1}. {label}
            </span>
          </button>
        ))}
      </div>

      {/* Step 1 — service */}
      {step === 0 && (
        <div className="stack" style={{ gap: 22 }}>
          {openRuns.length > 0 && (
            <section>
              <div className="category-heading">
                <div className="eyebrow">Group runs — lower fee</div>
              </div>
              <div className="grid grid-2">
                {openRuns.map((r) => (
                  <button key={r.id} className="run-ticket" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => chooseRun(r)}>
                    <DateBlock date={r.runDate} time={r.pickupTime} />
                    <div style={{ minWidth: 0 }}>
                      <div className="strong">{r.title}</div>
                      <div className="small muted">
                        {shortDate(r.runDate)} · <Clock time={r.pickupTime} compact />
                        {r.capacity > 0 && ` · ${Math.max(0, r.capacity - r.orderCount)} spots left`}
                      </div>
                      <div className="mono small" style={{ color: 'var(--primary)' }}>
                        {money(r.feeCents)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {!services?.length && <Empty title="No services yet">The organizer hasn't published any services.</Empty>}
          {CATEGORY_KEYS.filter((c) => services?.some((s) => s.category === c)).map((c) => {
            const Icon = CATEGORY_ICONS[c];
            return (
              <section key={c}>
                <div className="category-heading">
                  <Icon size={18} color="var(--primary)" />
                  <div className="eyebrow plain">{CATEGORIES[c].plural}</div>
                </div>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  {services!
                    .filter((s) => s.category === c)
                    .map((s) => (
                      <button key={s.id} className="service-card" aria-pressed={serviceId === s.id && !runId} onClick={() => chooseService(s)}>
                        <div className="row between" style={{ alignItems: 'baseline' }}>
                          <span className="strong">{s.name}</span>
                          <span className="price">{money(s.feeCents)}</span>
                        </div>
                        {s.description && <span className="small muted">{s.description}</span>}
                      </button>
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Step 2 — recipient & options */}
      {step === 1 && service && (
        <div className="stack" style={{ gap: 18 }}>
          {isStaff ? (
            <StaffCadetPicker value={staffCadet} onChange={(c) => { setStaffCadet(c); setCadetId(c?.id ?? null); }} error={errors.cadetId} />
          ) : user.role === 'parent' ? (
            <Card eyebrow="Recipient" title="Who is this for?">
              {family?.cadets.length ? (
                <div className="grid grid-2" style={{ gap: 10 }}>
                  {family.cadets.map((c) => (
                    <button key={c.id} className="choice" aria-pressed={cadetId === c.id} onClick={() => setCadetId(c.id)}>
                      <Avatar first={c.firstName} last={c.lastName} />
                      <span>
                        <span className="choice-title">
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="choice-sub" style={{ display: 'block' }}>
                          {[c.cadet?.classYear && `Class of ${c.cadet.classYear}`, c.cadet?.squadron].filter(Boolean).join(' · ') || 'Cadet'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty icon={<UserPlus />} title="Add your cadet first" action={<ButtonLink to="/app/family" variant="primary">Go to Family</ButtonLink>}>
                  Link with your cadet's account or add their details.
                </Empty>
              )}
              {errors.cadetId && <div className="error-text" style={{ marginTop: 8 }}>{errors.cadetId}</div>}
            </Card>
          ) : (
            <Card eyebrow="Payment" title="Who's paying the delivery fee?">
              <div className="grid grid-2" style={{ gap: 10 }}>
                <button className="choice" aria-pressed={payer === 'me'} onClick={() => setPayer('me')}>
                  <span className="choice-icon"><Check size={18} /></span>
                  <span>
                    <span className="choice-title">I'll pay</span>
                    <span className="choice-sub" style={{ display: 'block' }}>Pay {money(fee)} after submitting.</span>
                  </span>
                </button>
                <button className="choice" aria-pressed={payer === 'family'} onClick={() => setPayer('family')} disabled={!family?.parents.length}>
                  <span className="choice-icon"><Users size={18} /></span>
                  <span>
                    <span className="choice-title">Ask my family</span>
                    <span className="choice-sub" style={{ display: 'block' }}>
                      {family?.parents.length ? "They'll get a text with a link to pay." : 'Link a parent from Family first.'}
                    </span>
                  </span>
                </button>
              </div>
              {payer === 'family' && family && (
                <div style={{ marginTop: 14 }}>
                  <SelectField
                    label="Send the request to"
                    value={payerId ?? ''}
                    onChange={(e) => setPayerId(Number(e.target.value) || null)}
                    options={family.parents.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))}
                    placeholder="Choose…"
                    error={errors.payerId}
                  />
                </div>
              )}
            </Card>
          )}

          {(user.role === 'parent' || isStaff) && (
            <Card eyebrow="Options" title="Surprise?">
              <div className="stack" style={{ gap: 8 }}>
                {(
                  [
                    { v: 'none', icon: Check, t: 'Not a surprise', d: 'Your cadet sees everything and gets every update.' },
                    { v: 'heads_up', icon: Gift, t: 'Heads-up surprise', d: 'Your cadet is told when and where to be — not what it is.' },
                    { v: 'hidden', icon: EyeOff, t: 'Total surprise', d: 'Nothing is shared with your cadet until it has been delivered.' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    className="choice"
                    aria-pressed={surprise === o.v}
                    onClick={() => {
                      setSurprise(o.v);
                      if (o.v !== 'none') setAskCadet(false);
                    }}
                  >
                    <span className="choice-icon"><o.icon size={18} /></span>
                    <span>
                      <span className="choice-title">{o.t}</span>
                      <span className="choice-sub" style={{ display: 'block' }}>{o.d}</span>
                    </span>
                  </button>
                ))}
              </div>
              {user.role === 'parent' && surprise === 'none' && (
                <label className="check" style={{ marginTop: 16, opacity: selectedCadetManaged ? 0.55 : 1 }}>
                  <input type="checkbox" checked={askCadet} disabled={selectedCadetManaged} onChange={(e) => setAskCadet(e.target.checked)} />
                  <span>
                    <strong className="row" style={{ gap: 6, display: 'inline-flex' }}>
                      <MessageCircleQuestion size={16} /> Ask {cadetRow?.firstName ?? 'my cadet'} to confirm first
                    </strong>
                    <div className="help">
                      {selectedCadetManaged
                        ? `${cadetRow?.firstName} hasn't joined yet, so they can't confirm. Invite them from Family.`
                        : "They'll accept or decline before it goes to the organizer — handy when you're not sure of their schedule."}
                    </div>
                  </span>
                </label>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Step 3 — details & schedule */}
      {step === 2 && service && spec && (
        <div className="stack" style={{ gap: 18 }}>
          {(service.instructions || spec.prepaid) && (
            <Alert tone="info" title={spec.prepaid ? 'Before you continue' : undefined}>
              {spec.prepaid && <div>Place and pay for the order in the store's own app or website first, then enter the details here.</div>}
              {service.instructions && <div className="pre" style={{ marginTop: spec.prepaid ? 6 : 0 }}>{service.instructions}</div>}
              {service.category === 'package' && customer?.contact.packageAddress && (
                <div style={{ marginTop: 8 }}>
                  <strong>Ship to:</strong>
                  <div className="pre mono small">{customer.contact.packageAddress}</div>
                </div>
              )}
            </Alert>
          )}
          <Card eyebrow={spec.label} title="Order details">
            <div className="form-grid">
              {spec.fields.map((f) => (
                <DetailField key={f.key} field={f} value={details[f.key]} error={errors[`details.${f.key}`]} onChange={(v) => setDetails((d) => ({ ...d, [f.key]: v }))} />
              ))}
            </div>
          </Card>
          <Card eyebrow="Schedule" title={run ? 'Group run' : 'When & where'}>
            {run ? (
              <div className="row" style={{ gap: 14 }}>
                <DateBlock date={run.runDate} time={run.pickupTime} />
                <div>
                  <div className="strong">{run.title}</div>
                  <div className="small muted">
                    {shortDate(run.runDate)} · pickup <Clock time={run.pickupTime} />
                    {run.location && ` · delivered to ${run.location.name}`}
                  </div>
                  {run.notes && <div className="small pre" style={{ marginTop: 6 }}>{run.notes}</div>}
                </div>
              </div>
            ) : (
              <div className="form-grid">
                <TextField label="Date" type="date" value={serviceDate} min={isStaff ? undefined : todayIn(tz)} onChange={(e) => setServiceDate(e.target.value)} required error={errors.serviceDate} />
                <TextField
                  label={spec.timeLabel}
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  error={errors.time}
                  help={time ? `${time12(time)} · ${time.replace(':', '')} hrs${spec.timeHelp ? ` — ${spec.timeHelp}` : ''}` : spec.timeHelp}
                />
                {service.category !== 'transport' && !!locations?.length && (
                  <SelectField
                    label="Deliver to"
                    wrapClass="full"
                    value={locationId ?? ''}
                    onChange={(e) => setLocationId(Number(e.target.value) || null)}
                    options={locations.map((l) => ({ value: l.id, label: l.name }))}
                    help={locations.find((l) => l.id === locationId)?.details}
                  />
                )}
              </div>
            )}
            {blackout && (
              <div style={{ marginTop: 14 }}>
                <Alert tone="danger" title="No deliveries that day">
                  {blackout.reason || 'Please choose another date.'}
                </Alert>
              </div>
            )}
            {!run && sched && leadHours !== null && leadHours >= 0 && leadHours < sched.minLeadHours && !isStaff && (
              <div style={{ marginTop: 14 }}>
                <Alert tone="warn" title="Short notice">
                  Orders usually need {sched.minLeadHours} hours' notice. You can still send it — it will be reviewed case by case.
                </Alert>
              </div>
            )}
            {!run && sched && time && (time < sched.windowStart || time > sched.windowEnd) && (
              <div className="help" style={{ marginTop: 10 }}>
                <Info size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Regular deliveries run {time12(sched.windowStart)}–{time12(sched.windowEnd)}. Other times depend on availability.
              </div>
            )}
          </Card>
          <Card eyebrow="Anything else" title="Notes">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, allergies, who's meeting the driver…" optional />
          </Card>
        </div>
      )}

      {/* Step 4 — review */}
      {step === 3 && service && spec && (
        <div className="stack" style={{ gap: 18 }}>
          <Card eyebrow="Review" title={service.name}>
            <dl className="kv">
              <dt>For</dt>
              <dd>
                {cadetRow ? `${cadetRow.firstName} ${cadetRow.lastName}` : '—'}
                {surprise !== 'none' && <span className="badge badge-violet" style={{ marginLeft: 8 }}><Gift size={12} /> {surprise === 'hidden' ? 'Total surprise' : 'Heads-up surprise'}</span>}
              </dd>
              <dt>When</dt>
              <dd>
                {shortDate(serviceDate)} · <Clock time={time} />
              </dd>
              {service.category !== 'transport' && (
                <>
                  <dt>Deliver to</dt>
                  <dd>{locations?.find((l) => l.id === locationId)?.name ?? '—'}</dd>
                </>
              )}
              {spec.fields
                .filter((f) => details[f.key] !== undefined && details[f.key] !== '' && details[f.key] !== false)
                .map((f) => (
                  <FragmentKV key={f.key} label={f.label} value={displayValue(f, details[f.key])} />
                ))}
              {notes && <FragmentKV label="Notes" value={notes} />}
              {askCadet && <FragmentKV label="Confirmation" value={`${cadetRow?.firstName} will be asked to accept first`} />}
              {payer === 'family' && payerId && (
                <FragmentKV label="Paid by" value={family?.parents.find((p) => p.id === payerId)?.firstName ?? ''} />
              )}
            </dl>
          </Card>

          <Card eyebrow="Delivery fee" title="Total">
            {customer?.payments.allowTips && (
              <div style={{ marginBottom: 14 }}>
                <div className="label" style={{ marginBottom: 8 }}>Add a tip for the driver?</div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {[0, 300, 500, 1000].map((c) => (
                    <button key={c} className="chip" aria-pressed={tipCents === c} onClick={() => setTipCents(c)}>
                      {c === 0 ? 'No tip' : money(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="summary-line">
              <span>Delivery fee</span>
              <span className="mono">{money(fee)}</span>
            </div>
            {tipCents > 0 && (
              <div className="summary-line">
                <span>Tip</span>
                <span className="mono">{money(tipCents)}</span>
              </div>
            )}
            <div className="summary-line total">
              <span>Due after confirmation</span>
              <span className="mono">{money(fee + tipCents)}</span>
            </div>
            {spec.prepaid && <p className="help" style={{ marginTop: 8 }}>The store order itself is paid directly to the store.</p>}
          </Card>
          {!isStaff && (
            <p className="small muted">
              <Zap size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> You'll get a text when it's confirmed, when it's on the way (with an ETA), and a photo when it's delivered.
            </p>
          )}
        </div>
      )}

      {step > 0 && (
        <div className="sticky-actions">
          <Button onClick={back} icon={<ArrowLeft />}>
            Back
          </Button>
          {step < 3 ? (
            <Button variant="primary" onClick={next}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button variant="primary" size="lg" loading={submit.isPending} onClick={() => submit.mutate()}>
              {askCadet ? `Send to ${cadetRow?.firstName ?? 'cadet'}` : isStaff ? 'Log & confirm order' : 'Submit request'}
            </Button>
          )}
        </div>
      )}
      {step === 0 && (
        <p className="small muted" style={{ marginTop: 24 }}>
          Need something not listed? <Link to="/app/inbox">Send a message</Link> — every request is considered.
        </p>
      )}
    </div>
  );
}

function FragmentKV({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="pre">{value}</dd>
    </>
  );
}

function displayValue(f: FieldSpec, v: unknown): string {
  if (f.type === 'checkbox') return v ? 'Yes' : 'No';
  if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? String(v);
  if (f.type === 'time' && typeof v === 'string') return `${v.replace(':', '')} (${time12(v)})`;
  if (f.type === 'date' && typeof v === 'string') return shortDate(v);
  return String(v);
}

function DetailField({ field, value, error, onChange }: { field: FieldSpec; value: unknown; error?: string; onChange: (v: string | number | boolean | null) => void }) {
  const cls = field.half ? undefined : 'full';
  if (field.type === 'checkbox') {
    return (
      <label className={`check ${cls ?? ''}`} style={{ alignSelf: 'end', paddingBottom: 8 }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <strong>{field.label}</strong>
          {field.help && <div className="help">{field.help}</div>}
        </span>
      </label>
    );
  }
  if (field.type === 'textarea') {
    return (
      <TextArea
        label={field.label}
        wrapClass={cls}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        help={field.help}
        error={error}
        required={field.required}
        optional={!field.required}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <SelectField
        label={field.label}
        wrapClass={cls}
        value={String(value ?? '')}
        options={field.options ?? []}
        placeholder="Choose…"
        error={error}
        required={field.required}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <TextField
      label={field.label}
      wrapClass={cls}
      type={field.type === 'number' ? 'number' : field.type}
      min={field.type === 'number' ? 0 : undefined}
      value={value === null || value === undefined ? '' : String(value)}
      placeholder={field.placeholder}
      help={field.help}
      error={error}
      required={field.required}
      optional={!field.required}
      onChange={(e) => onChange(field.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
    />
  );
}

function StaffCadetPicker({ value, onChange, error }: { value: UserDTO | null; onChange: (c: UserDTO | null) => void; error?: string }) {
  const [q, setQ] = useState('');
  const { can } = useAuth();
  const { data } = useQuery({
    queryKey: ['people', 'cadet', q],
    queryFn: () => get<UserDTO[]>(`/staff/people${qs({ role: 'cadet', q })}`),
    enabled: can('people') || can('dispatch'),
  });
  return (
    <Card eyebrow="Recipient" title="Which cadet?" actions={<ButtonLink to="/app/people?add=1" size="sm" icon={<UserPlus />}>New family</ButtonLink>}>
      {value ? (
        <div className="row">
          <Avatar first={value.firstName} last={value.lastName} />
          <div style={{ flex: 1 }}>
            <div className="strong">
              {value.firstName} {value.lastName}
            </div>
            <div className="small muted">{[value.cadet?.classYear, value.cadet?.squadron, value.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <Button size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        </div>
      ) : (
        <div className="stack">
          <Field label="Search cadets" error={error}>
            {(id) => (
              <div className="input-group">
                <span className="addon">
                  <Search size={16} />
                </span>
                <input id={id} className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" />
              </div>
            )}
          </Field>
          <div className="list card flat" style={{ maxHeight: 280, overflow: 'auto' }}>
            {data?.slice(0, 30).map((c) => (
              <button key={c.id} className="item" onClick={() => onChange(c)}>
                <Avatar first={c.firstName} last={c.lastName} size="sm" />
                <span className="strong">
                  {c.firstName} {c.lastName}
                </span>
                <span className="small muted">{c.cadet?.squadron}</span>
              </button>
            ))}
            {data && !data.length && <div className="empty small">No cadets match.</div>}
          </div>
        </div>
      )}
    </Card>
  );
}

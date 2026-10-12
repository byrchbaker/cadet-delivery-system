import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Check, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { ROLE_LABELS, HELPER_PERMISSIONS, type UserDTO } from '@cds/shared';
import { ApiError, patch, post } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { usePublicInfo } from '../lib/queries';
import { THEMES, useTheme, type Mode } from '../lib/theme';
import { Button, Card, PageHeader, Segmented, SelectField, Switch, TextField } from '../components/ui';
import { useToast } from '../components/toast';

export function ProfilePage() {
  const user = useUser();
  const { setUser, logout } = useAuth();
  const { data: info } = usePublicInfo();
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? '',
    phone: user.phone ?? '',
    classYear: user.cadet?.classYear ?? '',
    squadron: user.cadet?.squadron ?? '',
    dorm: user.cadet?.dorm ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (extra: Record<string, unknown> = {}) =>
      patch<{ user: UserDTO }>('/me', {
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        phone: f.phone,
        cadet: user.role === 'cadet' ? { classYear: f.classYear, squadron: f.squadron, dorm: f.dorm } : undefined,
        ...extra,
      }),
    onSuccess: (r) => {
      setUser(r.user);
      setErrors({});
      toast.ok('Saved');
    },
    onError: (e) => {
      setErrors((e as ApiError).fields ?? {});
      toast.error(e);
    },
  });
  const prefs = useMutation({
    mutationFn: (p: { notifySms?: boolean; notifyEmail?: boolean }) => patch<{ user: UserDTO }>('/me', p),
    onSuccess: (r) => setUser(r.user),
    onError: (e) => toast.error(e),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const lists = info?.lists;
  const opt = (a?: string[]) => (a ?? []).map((v) => ({ value: v, label: v }));

  return (
    <div className="content narrow">
      <PageHeader eyebrow={ROLE_LABELS[user.role]} title="Your profile" />
      <div className="stack" style={{ gap: 18 }}>
        <Card eyebrow="Contact" title="Personal details">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({});
            }}
          >
            <div className="form-grid">
              <TextField label="First name" value={f.firstName} onChange={set('firstName')} error={errors.firstName} />
              <TextField label="Last name" value={f.lastName} onChange={set('lastName')} error={errors.lastName} />
              <TextField label="Email" type="email" value={f.email} onChange={set('email')} error={errors.email} />
              <TextField label="Mobile phone" type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} help="Used for delivery texts." />
              {user.role === 'cadet' && (
                <>
                  {lists?.classYears.length ? <SelectField label="Class" value={f.classYear} onChange={set('classYear')} options={opt(lists.classYears)} placeholder="Choose…" /> : <TextField label="Class year" value={f.classYear} onChange={set('classYear')} />}
                  {lists?.squadrons.length ? <SelectField label="Squadron" value={f.squadron} onChange={set('squadron')} options={opt(lists.squadrons)} placeholder="Choose…" /> : <TextField label="Squadron" value={f.squadron} onChange={set('squadron')} />}
                  {lists?.dorms.length ? <SelectField label="Dormitory" wrapClass="full" value={f.dorm} onChange={set('dorm')} options={opt(lists.dorms)} placeholder="Choose…" /> : <TextField label="Dormitory" wrapClass="full" value={f.dorm} onChange={set('dorm')} />}
                </>
              )}
            </div>
            <div>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Save details
              </Button>
            </div>
          </form>
        </Card>

        <Card eyebrow="Notifications" title="How should we reach you?">
          <div className="stack" style={{ gap: 16 }}>
            <Switch checked={user.notifySms} onChange={(v) => prefs.mutate({ notifySms: v })} label="Text messages" description="Confirmations, ETAs and delivery photos. Reply STOP to any text to opt out." />
            <Switch checked={user.notifyEmail} onChange={(v) => prefs.mutate({ notifyEmail: v })} label="Email" description="Receipts, reminders and announcements." />
            <p className="help">You always get in-app notifications.</p>
          </div>
        </Card>

        <AppearanceCard />

        {user.role === 'helper' && (
          <Card eyebrow="Helper" title="Your access">
            <ul className="stack" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>
              {user.permissions.length ? user.permissions.map((p) => <li key={p}>{HELPER_PERMISSIONS[p].label}</li>) : <li className="muted">Waiting for the organizer to approve your access.</li>}
            </ul>
          </Card>
        )}

        <PasswordCard />

        <Button
          icon={<LogOut />}
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const { theme, mode, setTheme, setMode, locked } = useTheme();
  return (
    <Card eyebrow="Appearance" title="Theme">
      <div className="stack" style={{ gap: 16 }}>
        {!locked && (
          <div className="grid grid-3" style={{ gap: 10 }}>
            {THEMES.map((t) => (
              <button key={t.id} className="choice" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} style={{ flexDirection: 'column', gap: 10 }}>
                <span className="row" style={{ gap: 0, width: '100%', height: 34, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <span style={{ flex: 2, height: '100%', background: t.swatch[0] }} />
                  <span style={{ flex: 1, height: '100%', background: t.swatch[1] }} />
                </span>
                <span>
                  <span className="choice-title row" style={{ gap: 6 }}>
                    {t.label} {theme === t.id && <Check size={15} />}
                  </span>
                  <span className="choice-sub" style={{ display: 'block' }}>
                    {t.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="row between wrap">
          <span className="label">Light or dark</span>
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'light', label: <><Sun size={14} /> Light</> },
              { value: 'dark', label: <><Moon size={14} /> Dark</> },
              { value: 'system', label: <><Monitor size={14} /> Auto</> },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: () => post('/me/password', { current, next }),
    onSuccess: () => {
      toast.ok('Password changed. Other devices were signed out.');
      setCurrent('');
      setNext('');
      setErrors({});
    },
    onError: (e) => setErrors((e as ApiError).fields ?? { next: (e as ApiError).message }),
  });
  return (
    <Card eyebrow="Security" title="Change password">
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.next} />
        <div className="full">
          <Button type="submit" disabled={!current || next.length < 8} loading={change.isPending}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

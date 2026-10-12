import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, HeartHandshake, Users } from 'lucide-react';
import type { UserDTO } from '@cds/shared';
import { ApiError, get, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePublicInfo } from '../../lib/queries';
import { homePath } from '../../components/AppShell';
import { Alert, Button, SelectField, TextArea, TextField } from '../../components/ui';
import { PublicLayout } from './PublicLayout';

type Role = 'parent' | 'cadet' | 'helper';

interface InviteInfo {
  kind: 'family' | 'helper';
  role: Role;
  fromName: string;
  prefill: { firstName: string; lastName: string; phone: string | null } | null;
}

export function Register() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser, user } = useAuth();
  const { data: info } = usePublicInfo();
  const invite = useQuery({ queryKey: ['invite', code], queryFn: () => get<InviteInfo>(`/invites/${code}`), enabled: !!code, retry: false });

  const initialRole = (params.get('role') as Role) || null;
  const [role, setRole] = useState<Role | null>(initialRole && ['parent', 'cadet', 'helper'].includes(initialRole) ? initialRole : null);
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', classYear: '', squadron: '', dorm: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invite.data) return;
    setRole(invite.data.role);
    if (invite.data.prefill) setF((s) => ({ ...s, firstName: invite.data!.prefill!.firstName, lastName: invite.data!.prefill!.lastName, phone: invite.data!.prefill!.phone ?? '' }));
  }, [invite.data]);

  // Signed in already and following a family link → redeem instead of registering.
  const [linked, setLinked] = useState('');
  useEffect(() => {
    if (user && code && invite.data?.kind === 'family' && !invite.data.prefill) {
      post<{ linked: UserDTO }>('/family/redeem', { code })
        .then((r) => setLinked(`${r.linked.firstName} ${r.linked.lastName}`))
        .catch((e) => setError((e as ApiError).message));
    }
  }, [user, code, invite.data]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const lists = info?.lists;
  const closed = info && !code && ((role === 'helper' && !info.registration.helperApplications) || (role !== 'helper' && role && !info.registration.openSignup));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const { user: u } = await post<{ user: UserDTO }>('/auth/register', {
        role,
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        phone: f.phone,
        password: f.password,
        invite: code,
        cadet: role === 'cadet' ? { classYear: f.classYear, squadron: f.squadron, dorm: f.dorm } : undefined,
        note: role === 'helper' ? f.note : undefined,
      });
      setUser(u);
      navigate(u.role === 'parent' && !code ? '/app/family?welcome=1' : homePath(u), { replace: true });
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message);
      setErrors(apiErr.fields ?? {});
    } finally {
      setBusy(false);
    }
  };

  if (linked) {
    return (
      <PublicLayout>
        <div className="auth-wrap">
          <div className="card auth-card card-body stack" style={{ gap: 14 }}>
            <Alert tone="success" title="Linked">
              Your account is now linked with {linked}.
            </Alert>
            <Button variant="primary" onClick={() => navigate('/app/family')}>
              Go to Family
            </Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  const roleCards: { id: Role; title: string; text: string; icon: typeof Users }[] = [
    { id: 'parent', title: 'Parent or family', text: 'Order for your cadet, send surprises, and pay delivery fees.', icon: Users },
    { id: 'cadet', title: 'Cadet', text: 'Order for yourself, track deliveries, and accept orders from family.', icon: GraduationCap },
    { id: 'helper', title: 'Helper', text: 'Help run deliveries. The organizer approves each helper.', icon: HeartHandshake },
  ];

  const options = (arr: string[] | undefined) => (arr ?? []).map((v) => ({ value: v, label: v }));

  return (
    <PublicLayout>
      <div className="auth-wrap">
        <form className="card auth-card" style={{ ['--w' as string]: '560px' }} onSubmit={submit}>
          <div className="card-body stack" style={{ gap: 18 }}>
            <div>
              <div className="eyebrow">{invite.data ? 'You were invited' : 'Get started'}</div>
              <h1>Create your account</h1>
            </div>
            {code && invite.isError && <Alert tone="danger">This invite link is invalid or has expired. Ask for a new one.</Alert>}
            {invite.data && (
              <Alert tone="info">
                {invite.data.kind === 'helper'
                  ? `${invite.data.fromName} invited you to join the delivery team. Your access is pre-approved.`
                  : `${invite.data.fromName} invited you — your accounts will be linked automatically.`}
              </Alert>
            )}

            {!invite.data && (
              <div className="stack" style={{ gap: 8 }}>
                <div className="label">I am a…</div>
                {roleCards
                  .filter((r) => r.id !== 'helper' || info?.registration.helperApplications)
                  .map((r) => (
                    <button key={r.id} type="button" className="choice" aria-pressed={role === r.id} onClick={() => setRole(r.id)}>
                      <span className="choice-icon">
                        <r.icon size={20} />
                      </span>
                      <span>
                        <span className="choice-title">{r.title}</span>
                        <span className="choice-sub" style={{ display: 'block' }}>
                          {r.text}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
            )}

            {closed && (
              <Alert tone="warn">
                {role === 'helper' ? 'Helper applications are closed right now.' : 'Sign-up is by invitation. Ask your family member or the organizer for an invite link.'}
              </Alert>
            )}

            {role && !closed && (
              <>
                {error && <Alert tone="danger">{error}</Alert>}
                <div className="form-grid">
                  <TextField label="First name" value={f.firstName} onChange={set('firstName')} required error={errors.firstName} autoComplete="given-name" />
                  <TextField label="Last name" value={f.lastName} onChange={set('lastName')} required error={errors.lastName} autoComplete="family-name" />
                  <TextField label="Email" type="email" value={f.email} onChange={set('email')} required error={errors.email} autoComplete="email" wrapClass="full" />
                  <TextField
                    label="Mobile phone"
                    type="tel"
                    value={f.phone}
                    onChange={set('phone')}
                    required
                    error={errors.phone}
                    autoComplete="tel"
                    help="Delivery updates are texted here."
                  />
                  <TextField label="Password" type="password" value={f.password} onChange={set('password')} required minLength={8} error={errors.password} autoComplete="new-password" help="At least 8 characters." />
                  {role === 'cadet' && (
                    <>
                      {lists?.classYears.length ? (
                        <SelectField label="Class" value={f.classYear} onChange={set('classYear')} options={options(lists.classYears)} placeholder="Choose…" />
                      ) : (
                        <TextField label="Class year" value={f.classYear} onChange={set('classYear')} placeholder="2028" />
                      )}
                      {lists?.squadrons.length ? (
                        <SelectField label="Squadron" value={f.squadron} onChange={set('squadron')} options={options(lists.squadrons)} placeholder="Choose…" />
                      ) : (
                        <TextField label="Squadron" value={f.squadron} onChange={set('squadron')} />
                      )}
                      {lists?.dorms.length ? (
                        <SelectField label="Dormitory" value={f.dorm} onChange={set('dorm')} options={options(lists.dorms)} placeholder="Choose…" wrapClass="full" />
                      ) : (
                        <TextField label="Dormitory" value={f.dorm} onChange={set('dorm')} wrapClass="full" />
                      )}
                    </>
                  )}
                  {role === 'helper' && !invite.data && (
                    <TextArea
                      label="A note for the organizer"
                      optional
                      wrapClass="full"
                      value={f.note}
                      onChange={set('note')}
                      placeholder="How you know the family, when you're available, what you drive…"
                    />
                  )}
                </div>
                <Button type="submit" variant="primary" size="lg" block loading={busy}>
                  {role === 'helper' && !invite.data ? 'Submit application' : 'Create account'}
                </Button>
              </>
            )}
            <div className="small muted">
              Already have an account? <Link to={`/login${code ? `?next=/join/${code}` : ''}`}>Sign in</Link>
            </div>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}

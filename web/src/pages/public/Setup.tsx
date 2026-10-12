import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDTO } from '@cds/shared';
import { ApiError, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Button, TextField } from '../../components/ui';
import { PublicLayout } from './PublicLayout';

export function Setup() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const [f, setF] = useState({ businessName: '', firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [starter, setStarter] = useState({ services: true, locations: true, lists: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await post<{ user: UserDTO }>('/setup', { ...f, starter });
      setUser(user);
      await qc.invalidateQueries({ queryKey: ['public-info'] });
      navigate('/app/settings/business?welcome=1', { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
      setErrors((err as ApiError).fields ?? {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout minimal>
      <div className="auth-wrap">
        <form className="card auth-card" style={{ ['--w' as string]: '600px' }} onSubmit={submit}>
          <div className="card-body stack" style={{ gap: 18 }}>
            <div>
              <div className="eyebrow">First-time setup</div>
              <h1>Set up your delivery service</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                This creates the organizer account. Everything here — prices, locations, messages, payment links — can be changed later in Settings.
              </p>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="form-grid">
              <TextField label="Business name" value={f.businessName} onChange={set('businessName')} required wrapClass="full" placeholder="e.g. Cadet Delivery Service" error={errors.businessName} />
              <TextField label="Your first name" value={f.firstName} onChange={set('firstName')} required error={errors.firstName} />
              <TextField label="Your last name" value={f.lastName} onChange={set('lastName')} required error={errors.lastName} />
              <TextField label="Email" type="email" value={f.email} onChange={set('email')} required error={errors.email} autoComplete="email" />
              <TextField label="Mobile phone" type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} help="New-order alerts are texted here." />
              <TextField label="Password" type="password" value={f.password} onChange={set('password')} required minLength={8} wrapClass="full" error={errors.password} autoComplete="new-password" />
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <div className="label">Start with</div>
              <label className="check">
                <input type="checkbox" checked={starter.services} onChange={(e) => setStarter((s) => ({ ...s, services: e.target.checked }))} />
                <span>
                  <strong>Standard service menu</strong>
                  <div className="help">Food, birthday, grocery, package, laundry and ride services with typical prices. Edit or remove any of them.</div>
                </span>
              </label>
              <label className="check">
                <input type="checkbox" checked={starter.locations} onChange={(e) => setStarter((s) => ({ ...s, locations: e.target.checked }))} />
                <span>
                  <strong>Common drop-off points</strong>
                  <div className="help">Arnold Hall delivery shelf and the dormitory entry points.</div>
                </span>
              </label>
              <label className="check">
                <input type="checkbox" checked={starter.lists} onChange={(e) => setStarter((s) => ({ ...s, lists: e.target.checked }))} />
                <span>
                  <strong>Class years, squadrons and dorms</strong>
                  <div className="help">Pick-lists for cadet profiles.</div>
                </span>
              </label>
            </div>
            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              Create organizer account
            </Button>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}

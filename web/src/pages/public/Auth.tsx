import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { UserDTO } from '@cds/shared';
import { ApiError, post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { homePath } from '../../components/AppShell';
import { Alert, Button, TextField } from '../../components/ui';
import { PublicLayout } from './PublicLayout';

export function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await post<{ user: UserDTO }>('/auth/login', { email, password });
      setUser(user);
      const next = params.get('next');
      navigate(next && next.startsWith('/app') ? next : homePath(user), { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <div className="auth-wrap">
        <form className="card auth-card" onSubmit={submit}>
          <div className="card-body stack" style={{ gap: 16 }}>
            <div>
              <div className="eyebrow">Welcome back</div>
              <h1>Sign in</h1>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              Sign in
            </Button>
            <div className="row between small">
              <Link to="/forgot">Forgot password?</Link>
              <Link to="/register">Create an account</Link>
            </div>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PublicLayout>
      <div className="auth-wrap">
        <form className="card auth-card" onSubmit={submit}>
          <div className="card-body stack" style={{ gap: 16 }}>
            <div>
              <div className="eyebrow">Account help</div>
              <h1>Reset your password</h1>
            </div>
            {sent ? (
              <Alert tone="success" title="Check your email">
                If an account exists for {email}, a link to set a new password is on its way. It expires in 2 hours.
              </Alert>
            ) : (
              <>
                <p className="muted">Enter the email on your account. We'll send a link to choose a new password.</p>
                {error && <Alert tone="danger">{error}</Alert>}
                <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <Button type="submit" variant="primary" block loading={busy}>
                  Send reset link
                </Button>
              </>
            )}
            <Link to="/login" className="small">
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user } = await post<{ user: UserDTO }>('/auth/reset', { token: params.get('token') ?? '', password });
      setUser(user);
      navigate(homePath(user), { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PublicLayout>
      <div className="auth-wrap">
        <form className="card auth-card" onSubmit={submit}>
          <div className="card-body stack" style={{ gap: 16 }}>
            <div>
              <div className="eyebrow">Account help</div>
              <h1>Choose a password</h1>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <TextField label="New password" type="password" autoComplete="new-password" minLength={8} help="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" variant="primary" block loading={busy}>
              Save and sign in
            </Button>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}

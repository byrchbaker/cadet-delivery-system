import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { usePublicInfo } from '../../lib/queries';
import { Brand } from '../../components/Logo';
import { ButtonLink } from '../../components/ui';

export function PublicLayout({ children, minimal }: { children: ReactNode; minimal?: boolean }) {
  const { data: info } = usePublicInfo();
  const { user } = useAuth();
  const name = info?.profile.businessName ?? 'Cadet Delivery';
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header className="public-top">
        <div className="public-top-inner">
          <Link to="/" className="brand">
            <Brand name={name} />
          </Link>
          <div className="spacer" />
          {!minimal &&
            (user ? (
              <ButtonLink to="/app" variant="primary" size="sm">
                Open app
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register" variant="primary" size="sm" className="hide-xs">
                  Create account
                </ButtonLink>
              </>
            ))}
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <span>
            © {new Date().getFullYear()} {name}
          </span>
          <span className="spacer" />
          <span>Independent family-run service. Not affiliated with or endorsed by the U.S. Air Force Academy or the Department of the Air Force.</span>
        </div>
      </footer>
    </div>
  );
}

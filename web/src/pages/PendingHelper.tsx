import { Clock, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '../lib/auth';
import { usePublicInfo } from '../lib/queries';
import { Button, Card } from '../components/ui';

export function PendingHelper() {
  const user = useUser();
  const { logout } = useAuth();
  const { data: info } = usePublicInfo();
  const navigate = useNavigate();
  return (
    <div className="content narrow">
      <Card className="accent">
        <div className="stack" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div className="empty-icon" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--warn-bg)', color: 'var(--warn)', display: 'grid', placeItems: 'center' }}>
            <Clock />
          </div>
          <div>
            <div className="eyebrow">Helper application</div>
            <h1 className="display" style={{ fontSize: 30, marginTop: 6 }}>
              Thanks, {user.firstName} — you're on the list.
            </h1>
          </div>
          <p className="muted">
            {info?.profile.ownerName || 'The organizer'} reviews every helper personally. Once approved you'll get a text and email, and this page becomes your run
            sheet with the deliveries assigned to you.
          </p>
          <p className="small muted">Make sure your phone number is right on your profile so the approval text reaches you.</p>
          <div className="row">
            <Button onClick={() => navigate('/app/profile')}>Check my profile</Button>
            <Button
              variant="ghost"
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
      </Card>
    </div>
  );
}

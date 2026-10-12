import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { usePublicInfo } from './lib/queries';
import { AppShell, homePath } from './components/AppShell';
import { Landing } from './pages/public/Landing';
import { Login, Forgot, Reset } from './pages/public/Auth';
import { Register } from './pages/public/Register';
import { Setup } from './pages/public/Setup';
import { Track } from './pages/public/Track';
import { CustomerHome } from './pages/customer/Home';
import { OrderWizard } from './pages/customer/OrderWizard';
import { OrdersPage } from './pages/customer/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { InboxPage } from './pages/Inbox';
import { FamilyPage } from './pages/customer/Family';
import { NewsPage } from './pages/News';
import { ProfilePage } from './pages/Profile';
import { PendingHelper } from './pages/PendingHelper';

const Dispatch = lazy(() => import('./pages/staff/Dispatch'));
const RunMode = lazy(() => import('./pages/staff/RunMode'));
const StaffOrders = lazy(() => import('./pages/staff/StaffOrders'));
const CalendarPage = lazy(() => import('./pages/staff/Calendar'));
const RunsPage = lazy(() => import('./pages/staff/Runs'));
const PeoplePage = lazy(() => import('./pages/staff/People'));
const PersonPage = lazy(() => import('./pages/staff/Person'));
const PaymentsPage = lazy(() => import('./pages/staff/Payments'));
const TeamPage = lazy(() => import('./pages/staff/Team'));
const ReportsPage = lazy(() => import('./pages/staff/Reports'));
const SettingsPage = lazy(() => import('./pages/settings/Settings'));

function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
      <div className="spinner" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

function Gate({ staffOnly, children }: { staffOnly?: boolean; children: ReactNode }) {
  const { user, staff } = useAuth();
  if (!user) return null;
  if (user.status === 'pending') return <PendingHelper />;
  if (staffOnly && !staff) return <Navigate to="/app" replace />;
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

function AppIndex() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.status === 'pending') return <PendingHelper />;
  return <Navigate to={homePath(user)} replace />;
}

function OrdersSwitch() {
  const { staff, can } = useAuth();
  return staff && can('dispatch') ? <StaffOrders /> : <OrdersPage />;
}

export function App() {
  const { data: info, isLoading } = usePublicInfo();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (info?.needsSetup && location.pathname !== '/setup') return <Navigate to="/setup" replace />;

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/join/:code" element={<Register />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/t/:token" element={<Track />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<AppIndex />} />
        <Route path="home" element={<Gate><CustomerHome /></Gate>} />
        <Route path="new" element={<Gate><OrderWizard /></Gate>} />
        <Route path="orders" element={<Gate><OrdersSwitch /></Gate>} />
        <Route path="orders/:id" element={<Gate><OrderDetail /></Gate>} />
        <Route path="inbox" element={<Gate><InboxPage /></Gate>} />
        <Route path="inbox/:threadId" element={<Gate><InboxPage /></Gate>} />
        <Route path="family" element={<Gate><FamilyPage /></Gate>} />
        <Route path="news" element={<Gate><NewsPage /></Gate>} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="dispatch" element={<Gate staffOnly><Dispatch /></Gate>} />
        <Route path="run" element={<Gate staffOnly><RunMode /></Gate>} />
        <Route path="calendar" element={<Gate staffOnly><CalendarPage /></Gate>} />
        <Route path="runs" element={<Gate staffOnly><RunsPage /></Gate>} />
        <Route path="people" element={<Gate staffOnly><PeoplePage /></Gate>} />
        <Route path="people/:id" element={<Gate staffOnly><PersonPage /></Gate>} />
        <Route path="payments" element={<Gate staffOnly><PaymentsPage /></Gate>} />
        <Route path="team" element={<Gate staffOnly><TeamPage /></Gate>} />
        <Route path="reports" element={<Gate staffOnly><ReportsPage /></Gate>} />
        <Route path="settings" element={<Navigate to="/app/settings/business" replace />} />
        <Route path="settings/:tab" element={<Gate staffOnly><SettingsPage /></Gate>} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

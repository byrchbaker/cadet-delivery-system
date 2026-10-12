import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Navigation,
  PlusCircle,
  Repeat,
  Settings,
  Sun,
  UserCircle,
  Users,
  UsersRound,
  Clock,
} from 'lucide-react';
import { relativeTime, ROLE_LABELS, type HelperPermission } from '@cds/shared';
import { useAuth, useUser } from '../lib/auth';
import { post } from '../lib/api';
import { useBadges, useDashboard, useNotifications, usePublicInfo, useThreads } from '../lib/queries';
import { useRealtime } from '../lib/realtime';
import { useTheme } from '../lib/theme';
import { Brand, LogoMark } from './Logo';
import { Avatar, Button, Modal } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  badge?: number;
  run?: boolean;
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function homePath(user: { role: string; permissions: string[] }): string {
  if (user.role === 'organizer') return '/app/dispatch';
  if (user.role === 'helper') {
    if (user.permissions.includes('deliver') || user.permissions.includes('claim')) return '/app/run';
    if (user.permissions.includes('dispatch')) return '/app/dispatch';
    return '/app/inbox';
  }
  return '/app/home';
}

function useNav(): { groups: NavGroup[]; mobile: NavItem[] } {
  const user = useUser();
  const { can, staff } = useAuth();
  const active = user.status === 'active';
  const { data: threads } = useThreads(active);
  const { data: dash } = useDashboard(staff);
  const unread = threads?.filter((t) => t.unread > 0).length ?? 0;

  return useMemo(() => {
    const has = (p: HelperPermission) => can(p);
    if (!staff) {
      const items: NavItem[] = [
        { to: '/app/home', label: 'Home', icon: Home },
        { to: '/app/new', label: 'New order', icon: PlusCircle },
        { to: '/app/orders', label: 'Orders', icon: ClipboardList },
        { to: '/app/inbox', label: 'Messages', icon: Inbox, badge: unread },
        { to: '/app/family', label: 'Family', icon: UsersRound },
        { to: '/app/news', label: 'News', icon: Megaphone },
      ];
      return { groups: [{ items }], mobile: [items[0], items[2], items[1], items[3]] };
    }
    const ops: NavItem[] = [];
    if (has('dispatch')) ops.push({ to: '/app/dispatch', label: 'Dispatch', icon: LayoutDashboard, badge: (dash?.counts.requested ?? 0) || undefined });
    if (has('deliver') || has('claim')) ops.push({ to: '/app/run', label: 'Run Mode', icon: Navigation, run: true });
    if (has('dispatch')) {
      ops.push({ to: '/app/orders', label: 'Orders', icon: ClipboardList });
      ops.push({ to: '/app/calendar', label: 'Calendar', icon: CalendarDays });
      ops.push({ to: '/app/runs', label: 'Group runs', icon: Repeat });
    }
    const comms: NavItem[] = [
      { to: '/app/inbox', label: 'Inbox', icon: Inbox, badge: unread },
      { to: '/app/news', label: 'Announcements', icon: Megaphone },
    ];
    const biz: NavItem[] = [];
    if (has('people')) biz.push({ to: '/app/people', label: 'People', icon: Users });
    if (has('payments')) biz.push({ to: '/app/payments', label: 'Payments', icon: CreditCard, badge: (dash?.counts.paymentsToVerify ?? 0) || undefined });
    if (user.role === 'organizer') {
      biz.push({ to: '/app/team', label: 'Team', icon: UsersRound, badge: (dash?.counts.pendingHelpers ?? 0) || undefined });
      biz.push({ to: '/app/reports', label: 'Reports', icon: BarChart3 });
      biz.push({ to: '/app/settings', label: 'Settings', icon: Settings });
    }
    const groups: NavGroup[] = [{ label: 'Operations', items: ops }, { label: 'Communication', items: comms }];
    if (biz.length) groups.push({ label: 'Business', items: biz });
    const all = groups.flatMap((g) => g.items);
    const mobile = all.slice(0, 4);
    return { groups, mobile };
  }, [can, staff, unread, dash, user.role]);
}

export function AppShell() {
  const { user } = useAuth();
  if (!user) return null;
  return <Shell />;
}

function Shell() {
  const user = useUser();
  const { logout, staff } = useAuth();
  const { data: info } = usePublicInfo();
  const nav = useNav();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const pending = user.status === 'pending';
  useRealtime(!pending);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  const businessName = info?.profile.businessName ?? 'Cadet Delivery';
  const allItems = nav.groups.flatMap((g) => g.items);
  const extra = allItems.filter((i) => !nav.mobile.includes(i));

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link to={homePath(user)} className="sidebar-brand">
          <Brand name={businessName} sub={staff ? 'Operations' : 'Cadet services'} />
        </Link>
        {!pending &&
          nav.groups.map((g, i) => (
            <div className="nav-section" key={i}>
              {g.label && <div className="nav-label">{g.label}</div>}
              {g.items.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${item.run ? ' run' : ''}`}>
                  <item.icon />
                  {item.label}
                  {!!item.badge && <span className="count-pill">{item.badge}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        <div className="sidebar-foot">
          <Link to="/app/profile" className="user-chip">
            <Avatar first={user.firstName} last={user.lastName} size="sm" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="truncate strong" style={{ fontSize: 14 }}>
                {user.firstName} {user.lastName}
              </div>
              <div className="truncate" style={{ fontSize: 12, color: 'var(--nav-muted)' }}>
                {ROLE_LABELS[user.role]}
              </div>
            </div>
          </Link>
          <button className="nav-link" style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer' }} onClick={signOut}>
            <LogOut /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link to={homePath(user)} className="mobile-brand">
            <LogoMark size={30} />
            <span className="brand-name">{businessName}</span>
          </Link>
          <div className="spacer" />
          <ModeToggle />
          {!pending && <NotificationBell />}
          <Link to="/app/profile" className="btn btn-ghost btn-icon" aria-label="Profile">
            <UserCircle />
          </Link>
        </header>
        {pending && (
          <div className="banner">
            <Clock /> Your helper application is with the organizer. You'll get a text or email as soon as you're approved.
          </div>
        )}
        <Outlet />
      </div>

      {!pending && (
        <nav className="bottombar" aria-label="Quick navigation">
          {nav.mobile.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <item.icon />
              {item.label}
              {!!item.badge && <span className="count-pill">{item.badge}</span>}
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)}>
            <Menu />
            More
          </button>
        </nav>
      )}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu">
        <div className="sheet-nav">
          {extra.map((item) => (
            <Link key={item.to} to={item.to}>
              <item.icon size={22} />
              {item.label}
            </Link>
          ))}
          <Link to="/app/profile">
            <UserCircle size={22} />
            Profile
          </Link>
        </div>
        <Button block style={{ marginTop: 16 }} icon={<LogOut />} onClick={signOut}>
          Sign out
        </Button>
      </Modal>
    </div>
  );
}

function ModeToggle() {
  const { resolvedMode, setMode } = useTheme();
  return (
    <Button
      variant="ghost"
      iconOnly
      aria-label={resolvedMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setMode(resolvedMode === 'dark' ? 'light' : 'dark')}
    >
      {resolvedMode === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: badges } = useBadges(true);
  const { data: list } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const markAll = useMutation({
    mutationFn: () => post('/me/notifications/read', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['badges'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const count = badges?.notifications ?? 0;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <Button variant="ghost" iconOnly aria-label={`Notifications${count ? ` (${count} unread)` : ''}`} onClick={() => setOpen((o) => !o)} style={{ position: 'relative' }}>
        <Bell />
        {count > 0 && (
          <span className="count-pill" style={{ position: 'absolute', top: 2, right: 0, height: 17, minWidth: 17, fontSize: 10.5 }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Button>
      {open && (
        <div className="popover" style={{ color: 'var(--ink)' }}>
          <div className="row between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
            <div className="eyebrow plain">Notifications</div>
            {count > 0 && (
              <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
                Mark all read
              </Button>
            )}
          </div>
          <div className="list">
            {!list?.length && <div className="empty small">You're all caught up.</div>}
            {list?.slice(0, 25).map((n) => (
              <button
                key={n.id}
                className="item"
                style={{ alignItems: 'flex-start', background: n.readAt ? undefined : 'var(--primary-soft)' }}
                onClick={() => {
                  setOpen(false);
                  void post('/me/notifications/read', { ids: [n.id] }).then(() => qc.invalidateQueries({ queryKey: ['badges'] }));
                  if (n.link) navigate(n.link.startsWith('/t/') ? n.link : n.link);
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="strong small">{n.title}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    {n.body}
                  </div>
                  <div className="tiny faint" style={{ marginTop: 4 }}>
                    {relativeTime(n.createdAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

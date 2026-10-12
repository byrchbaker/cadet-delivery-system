import { Link } from 'react-router-dom';
import { ArrowRight, CreditCard, Gift, Megaphone, PackageOpen, PlusCircle, UserPlus } from 'lucide-react';
import { money, shortDate, todayIn, type OrderDTO } from '@cds/shared';
import { useUser } from '../../lib/auth';
import { useAnnouncements, useFamily, useOrders, usePublicInfo, useRuns } from '../../lib/queries';
import { OrderRow } from '../../components/OrderRow';
import { Eta, Tracker } from '../../components/Tracker';
import { ButtonLink, Card, Clock, DateBlock, Empty, LoadingRows, PageHeader, StatusBadge } from '../../components/ui';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function CustomerHome() {
  const user = useUser();
  const { data: info } = usePublicInfo();
  const { data: orders, isLoading } = useOrders({ scope: 'active' });
  const { data: family } = useFamily();
  const { data: runs } = useRuns();
  const { data: news } = useAnnouncements();
  const tz = info?.scheduling.timezone ?? 'America/Denver';

  const live = orders?.filter((o) => ['picking_up', 'picked_up', 'en_route'].includes(o.status)) ?? [];
  const toRespond = orders?.filter((o) => o.can.respond) ?? [];
  const toPay = orders?.filter((o) => o.can.pay) ?? [];
  const upcoming = orders?.filter((o) => !live.includes(o)) ?? [];
  const pinned = news?.find((n) => n.pinned) ?? news?.[0];
  const noCadets = user.role === 'parent' && family && family.cadets.length === 0;

  return (
    <div className="content">
      <PageHeader
        eyebrow={shortDate(todayIn(tz))}
        title={`${greeting()}, ${user.firstName}`}
        actions={
          <ButtonLink to="/app/new" variant="primary" icon={<PlusCircle />}>
            New order
          </ButtonLink>
        }
      />

      <div className="stack" style={{ gap: 18 }}>
        {noCadets && (
          <Card className="accent">
            <div className="row wrap" style={{ gap: 16 }}>
              <div className="empty-icon" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-soft)', color: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
                <UserPlus size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="strong">Add your cadet to get started</div>
                <div className="small muted">Link with your cadet's account using their family code, or add their details yourself.</div>
              </div>
              <ButtonLink to="/app/family" variant="primary">
                Add cadet
              </ButtonLink>
            </div>
          </Card>
        )}

        {toRespond.map((o) => (
          <ActionCard key={o.id} order={o} tone="violet" icon={<Gift size={20} />} title={`${o.createdBy.firstName} set up ${o.serviceName} for you`} cta="Review" />
        ))}
        {toPay.map((o) => (
          <ActionCard
            key={o.id}
            order={o}
            tone="warn"
            icon={<CreditCard size={20} />}
            title={o.payer?.id === user.id && o.createdBy.id !== user.id ? `${o.createdBy.firstName} asked you to cover ${o.serviceName}` : `Delivery fee due — ${o.serviceName}`}
            cta={`Pay ${money(o.totalCents)}`}
          />
        ))}

        {live.map((o) => (
          <Card key={o.id} eyebrow="Happening now" title={o.serviceName} actions={<span className="mono muted">#{o.ref}</span>}>
            <Tracker status={o.status} category={o.category} />
            <div className="tracker-caption">
              <StatusBadge status={o.status} category={o.category} />
              <Eta etaAt={o.etaAt} timezone={tz} status={o.status} />
              <span className="spacer" />
              <Link to={`/app/orders/${o.id}`} className="small strong">
                Details →
              </Link>
            </div>
          </Card>
        ))}

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 18 }} data-collapse>
          <Card eyebrow="Upcoming" title="Your orders" pad={false} actions={<Link to="/app/orders" className="small strong">All orders</Link>}>
            {isLoading ? (
              <LoadingRows rows={3} />
            ) : upcoming.length ? (
              <div className="list">
                {upcoming.map((o) => (
                  <OrderRow key={o.id} order={o} showCadet={user.role !== 'cadet'} />
                ))}
              </div>
            ) : (
              <Empty icon={<PackageOpen />} title="Nothing scheduled" action={<ButtonLink to="/app/new" variant="primary">Place an order</ButtonLink>}>
                Orders you place — and ones your family sets up for you — show up here.
              </Empty>
            )}
          </Card>

          <div className="stack" style={{ gap: 18 }}>
            {!!runs?.length && (
              <Card eyebrow="Group runs" title="Join a run" pad={false}>
                <div className="list">
                  {runs.slice(0, 4).map((r) => (
                    <Link key={r.id} to={`/app/new?run=${r.id}`} className="item">
                      <DateBlock date={r.runDate} time={r.pickupTime} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="strong truncate">{r.title}</div>
                        <div className="small muted">
                          <Clock time={r.pickupTime} compact /> · {money(r.feeCents)}
                        </div>
                      </div>
                      <ArrowRight size={16} color="var(--muted)" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}
            {pinned && (
              <Card eyebrow="News" title={pinned.title} actions={<Megaphone size={18} color="var(--muted)" />}>
                <p className="pre small" style={{ maxHeight: 160, overflow: 'hidden' }}>
                  {pinned.body}
                </p>
                <Link to="/app/news" className="small strong" style={{ display: 'inline-block', marginTop: 10 }}>
                  All announcements →
                </Link>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ order, tone, icon, title, cta }: { order: OrderDTO; tone: 'warn' | 'violet'; icon: React.ReactNode; title: string; cta: string }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid var(--${tone})` }}>
      <div className="card-body row wrap" style={{ gap: 14 }}>
        <div style={{ color: `var(--${tone})` }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="strong">{title}</div>
          <div className="small muted">
            {shortDate(order.serviceDate)} · <Clock time={order.time} compact /> · <span className="mono">#{order.ref}</span>
          </div>
        </div>
        <ButtonLink to={`/app/orders/${order.id}`} variant="primary" size="sm">
          {cta}
        </ButtonLink>
      </div>
    </div>
  );
}

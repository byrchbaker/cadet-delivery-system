import { Link } from 'react-router-dom';
import {
  Bell,
  Cake,
  Car,
  Gift,
  MapPin,
  MessageSquare,
  Package,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Timer,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS, money, shortDate, type Category } from '@cds/shared';
import { useAuth } from '../../lib/auth';
import { usePublicInfo } from '../../lib/queries';
import { Tracker } from '../../components/Tracker';
import { ButtonLink, Clock, DateBlock } from '../../components/ui';
import { PublicLayout } from './PublicLayout';

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  food: UtensilsCrossed,
  birthday: Cake,
  grocery: ShoppingBasket,
  package: Package,
  laundry: Shirt,
  transport: Car,
  other: Sparkles,
};

export function Landing() {
  const { data: info } = usePublicInfo();
  const { user } = useAuth();
  const profile = info?.profile;
  const services = info?.services ?? [];
  const runs = info?.runs ?? [];
  const orderLink = user ? '/app/new' : '/register';

  return (
    <PublicLayout>
      <section className="hero">
        <div className="hero-inner">
          <div>
            <div className="eyebrow">{profile?.serviceArea ? profile.serviceArea.split('\n')[0] : 'Cadet delivery & errands'}</div>
            <h1 style={{ marginTop: 14 }}>{profile?.tagline || 'Everyday needs, delivered to your cadet.'}</h1>
            <p className="lede">
              Restaurant orders, birthday surprises, groceries, packages, laundry and rides — requested in one place, tracked live, and handed off with a photo
              when it lands.
            </p>
            <div className="row wrap" style={{ marginTop: 28, gap: 12 }}>
              <ButtonLink to={orderLink} variant="primary" size="lg">
                Place an order
              </ButtonLink>
              {!user && (
                <ButtonLink to="/login" size="lg" className="btn-outline">
                  Sign in
                </ButtonLink>
              )}
            </div>
          </div>
          <div className="hero-panel" aria-hidden="true">
            <div className="row between" style={{ marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', opacity: 0.7, fontFamily: 'var(--font-display)' }}>Live tracking</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600 }}>Birthday cupcakes</div>
              </div>
              <span className="mono" style={{ opacity: 0.7 }}>
                #K7Q4M
              </span>
            </div>
            <Tracker status="en_route" />
            <div className="row" style={{ marginTop: 16, gap: 10 }}>
              <Timer size={18} />
              <span>
                On the way · ETA <span className="mono">1745</span>
              </span>
            </div>
            <div className="row" style={{ marginTop: 8, gap: 10, opacity: 0.8 }}>
              <Bell size={18} />
              <span>Texted to the cadet and the family automatically</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">How it works</div>
        <h2 className="section-title">Three steps. No back-and-forth.</h2>
        <div className="grid grid-3" style={{ marginTop: 28, gap: 20 }}>
          {[
            { n: '01', t: 'Request it', d: "Pick a service, add the store's order number and the name on the order, and choose a time. Families can send surprises or ask their cadet to confirm first." },
            { n: '02', t: 'Pay the delivery fee', d: 'Pay the store in its own app, then send the delivery fee from your phone. Semester subscribers skip this step.' },
            { n: '03', t: 'Follow it live', d: 'Confirmations, ETAs and a drop-off photo arrive by text and email — no need to chase anyone for an update.' },
          ].map((s) => (
            <div key={s.n} className="card card-pad stack" style={{ gap: 10 }}>
              <span className="step-num">{s.n}</span>
              <h3 className="display" style={{ fontSize: 22 }}>
                {s.t}
              </h3>
              <p className="muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {runs.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="eyebrow">Group runs</div>
          <h2 className="section-title">Open group orders</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Join a scheduled run for a lower delivery fee.
          </p>
          <div className="grid grid-auto" style={{ marginTop: 20, ['--min' as string]: '300px' }}>
            {runs.slice(0, 6).map((r) => (
              <Link key={r.id} to={user ? `/app/new?run=${r.id}` : '/register'} className="run-ticket">
                <DateBlock date={r.runDate} time={r.pickupTime} />
                <div style={{ minWidth: 0 }}>
                  <div className="strong">{r.title}</div>
                  <div className="small muted">
                    {shortDate(r.runDate)} · <Clock time={r.pickupTime} compact />
                    {r.location ? ` · ${r.location.name}` : ''}
                  </div>
                  <div className="mono small" style={{ color: 'var(--primary)', marginTop: 2 }}>
                    {money(r.feeCents)} delivery
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {services.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="eyebrow">Services & pricing</div>
          <h2 className="section-title">What we deliver</h2>
          <div className="grid grid-auto" style={{ marginTop: 24, ['--min' as string]: '320px' }}>
            {CATEGORY_KEYS.filter((c) => services.some((s) => s.category === c)).map((c) => {
              const Icon = CATEGORY_ICONS[c];
              return (
                <div key={c} className="card">
                  <div className="card-header">
                    <Icon size={20} />
                    <h3>{CATEGORIES[c].plural}</h3>
                  </div>
                  <div className="list">
                    {services
                      .filter((s) => s.category === c)
                      .map((s) => (
                        <div key={s.id} className="item" style={{ alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="strong">{s.name}</div>
                            {s.description && <div className="small muted">{s.description}</div>}
                          </div>
                          <span className="mono strong" style={{ color: 'var(--primary)' }}>
                            {money(s.feeCents)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="grid grid-3" style={{ gap: 20 }}>
          <Feature icon={Gift} title="Surprise deliveries" text="Keep it secret until it lands, or give your cadet a heads-up on when and where — without spoiling what." />
          <Feature icon={MessageSquare} title="One conversation" text="Questions, changes and replies to delivery texts all land in one inbox instead of scattered messages." />
          <Feature icon={MapPin} title={profile?.hours ? 'Hours & area' : 'Delivered to the shelf'} text={profile?.hours ? `${profile.hours}${profile.serviceArea ? ` · ${profile.serviceArea}` : ''}` : 'Orders are labeled with your cadet\'s name and photographed on drop-off.'} />
        </div>
      </section>

      {info?.registration.helperApplications && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="card card-pad row wrap between" style={{ gap: 16 }}>
            <div>
              <div className="eyebrow">Join the team</div>
              <div className="display" style={{ fontSize: 22, marginTop: 4 }}>
                Want to help with deliveries?
              </div>
              <p className="muted">Apply as a helper. The organizer reviews every application.</p>
            </div>
            <ButtonLink to="/register?role=helper">Apply to help</ButtonLink>
          </div>
        </section>
      )}
    </PublicLayout>
  );
}

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="empty-icon" style={{ width: 42, height: 42, borderRadius: 'var(--radius)', background: 'var(--primary-soft)', color: 'var(--primary)', display: 'grid', placeItems: 'center' }}>
        <Icon size={20} />
      </div>
      <h3 className="display" style={{ fontSize: 20 }}>
        {title}
      </h3>
      <p className="muted">{text}</p>
    </div>
  );
}

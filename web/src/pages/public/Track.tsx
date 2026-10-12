import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Camera, MapPin, Phone } from 'lucide-react';
import { formatPhone, relativeTime, shortDate, type Category, type LocationDTO, type OrderStatus } from '@cds/shared';
import { get } from '../../lib/api';
import { usePublicInfo } from '../../lib/queries';
import { Eta, Tracker } from '../../components/Tracker';
import { Alert, Card, Clock, StatusBadge } from '../../components/ui';
import { PublicLayout } from './PublicLayout';

interface TrackDTO {
  ref: string;
  status: OrderStatus;
  statusLabel: string;
  category: Category;
  serviceName: string;
  serviceDate: string;
  time: string;
  location: LocationDTO | null;
  etaAt: string | null;
  deliveredAt: string | null;
  deliveryNote: string | null;
  cadetName: string;
  events: { status: OrderStatus; label: string; at: string }[];
  hasPhoto: boolean;
  business: { name: string; phone: string };
}

export function Track() {
  const { token } = useParams();
  const { data: info } = usePublicInfo();
  const { data, isLoading, error } = useQuery({
    queryKey: ['track', token],
    queryFn: () => get<TrackDTO>(`/public/track/${token}`),
    refetchInterval: (q) => (q.state.data && ['delivered', 'cancelled', 'declined'].includes(q.state.data.status) ? false : 30_000),
    retry: false,
  });
  const tz = info?.scheduling.timezone ?? 'America/Denver';

  return (
    <PublicLayout>
      <div className="content narrow" style={{ paddingTop: 28 }}>
        {isLoading && <div className="spinner" />}
        {error && <Alert tone="danger">This tracking link is not valid.</Alert>}
        {data && (
          <div className="stack" style={{ gap: 16 }}>
            <div>
              <div className="eyebrow">
                Order <span className="mono">#{data.ref}</span>
              </div>
              <h1 className="display" style={{ fontSize: 32, marginTop: 6 }}>
                {data.serviceName}
              </h1>
              <p className="muted">
                For {data.cadetName} · {shortDate(data.serviceDate)} · <Clock time={data.time} />
              </p>
            </div>
            <Card>
              <Tracker status={data.status} category={data.category} />
              <div className="tracker-caption">
                <StatusBadge status={data.status} category={data.category} />
                <Eta etaAt={data.etaAt} timezone={tz} status={data.status} />
                {data.deliveredAt && <span className="muted small">Delivered {relativeTime(data.deliveredAt)}</span>}
              </div>
              {data.location && (
                <div className="row top" style={{ marginTop: 14 }}>
                  <MapPin size={18} color="var(--muted)" />
                  <div>
                    <div className="strong">{data.location.name}</div>
                    {data.location.details && <div className="small muted">{data.location.details}</div>}
                  </div>
                </div>
              )}
              {data.deliveryNote && (
                <div style={{ marginTop: 14 }}>
                  <Alert tone="success" title="Drop-off note">
                    {data.deliveryNote}
                  </Alert>
                </div>
              )}
            </Card>
            {data.hasPhoto && (
              <Card eyebrow="Proof of delivery" title={<span className="row"><Camera size={18} /> Drop-off photo</span>}>
                <div className="photo-proof">
                  <img src={`/api/public/track/${token}/photo`} alt="Delivery drop-off" />
                </div>
              </Card>
            )}
            <Card eyebrow="History" title="Updates">
              <div className="timeline">
                {data.events.map((e, i) => (
                  <div key={i} className="tl-item status">
                    <div className="tl-text strong">{e.label}</div>
                    <div className="tl-meta">{new Date(e.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
                  </div>
                ))}
              </div>
            </Card>
            {data.business.phone && (
              <div className="row muted small">
                <Phone size={16} /> Questions? Reply to the text or call {data.business.name} at <a href={`tel:${data.business.phone}`}>{formatPhone(data.business.phone)}</a>
              </div>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

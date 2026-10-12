import { Link } from 'react-router-dom';
import { Gift, MapPin, Store, User, Zap } from 'lucide-react';
import type { OrderDTO } from '@cds/shared';
import { DateBlock, PaymentBadge, StatusBadge } from './ui';

export function OrderRow({ order, showCadet = true, showPayment = true, to }: { order: OrderDTO; showCadet?: boolean; showPayment?: boolean; to?: string }) {
  const vendor = typeof order.details.vendor === 'string' ? order.details.vendor : null;
  return (
    <Link to={to ?? `/app/orders/${order.id}`} className="order-row">
      <DateBlock date={order.serviceDate} time={order.time} />
      <div style={{ minWidth: 0 }}>
        <div className="order-title">
          <span className="truncate">{order.serviceName}</span>
          {order.surprise !== 'none' && !order.redacted && <Gift size={15} color="var(--violet)" aria-label="Surprise" />}
          {order.shortNotice && <Zap size={15} color="var(--warn)" aria-label="Short notice" />}
        </div>
        <div className="order-meta">
          <span className="mono">#{order.ref}</span>
          {showCadet && (
            <span>
              <User /> {order.cadet.firstName} {order.cadet.lastName}
            </span>
          )}
          {vendor && (
            <span>
              <Store /> {vendor}
            </span>
          )}
          {order.location && (
            <span>
              <MapPin /> {order.location.name}
            </span>
          )}
          {order.assignedTo && <span>Driver: {order.assignedTo.firstName}</span>}
        </div>
      </div>
      <div className="right">
        <StatusBadge status={order.status} category={order.category} />
        {showPayment && !order.redacted && order.totalCents > 0 && !['cancelled', 'declined'].includes(order.status) && (
          <PaymentBadge status={order.paymentStatus} short />
        )}
      </div>
    </Link>
  );
}

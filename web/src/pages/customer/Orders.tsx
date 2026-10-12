import { useState } from 'react';
import { ClipboardList, PlusCircle } from 'lucide-react';
import { useUser } from '../../lib/auth';
import { useFamily, useOrders } from '../../lib/queries';
import { OrderRow } from '../../components/OrderRow';
import { ButtonLink, Card, Empty, LoadingRows, PageHeader, Segmented, SelectField } from '../../components/ui';

export function OrdersPage() {
  const user = useUser();
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const [cadetId, setCadetId] = useState<number | undefined>();
  const { data: family } = useFamily(user.role === 'parent');
  const { data: orders, isLoading } = useOrders({ scope, cadetId });
  const multi = user.role === 'parent' && (family?.cadets.length ?? 0) > 1;

  return (
    <div className="content">
      <PageHeader
        eyebrow="Orders"
        title={user.role === 'cadet' ? 'My orders' : 'Family orders'}
        actions={
          <ButtonLink to="/app/new" variant="primary" icon={<PlusCircle />}>
            New order
          </ButtonLink>
        }
      />
      <div className="row wrap" style={{ marginBottom: 14, gap: 12 }}>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'active', label: 'Upcoming & active' },
            { value: 'history', label: 'Past' },
          ]}
        />
        {multi && (
          <div style={{ width: 220 }}>
            <SelectField
              aria-label="Filter by cadet"
              value={cadetId ?? ''}
              onChange={(e) => setCadetId(Number(e.target.value) || undefined)}
              options={family!.cadets.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
              placeholder="All cadets"
            />
          </div>
        )}
      </div>
      <Card pad={false}>
        {isLoading ? (
          <LoadingRows />
        ) : orders?.length ? (
          <div className="list">
            {orders.map((o) => (
              <OrderRow key={o.id} order={o} showCadet={user.role !== 'cadet'} />
            ))}
          </div>
        ) : (
          <Empty icon={<ClipboardList />} title={scope === 'active' ? 'No upcoming orders' : 'No past orders yet'} action={scope === 'active' ? <ButtonLink to="/app/new" variant="primary">Place an order</ButtonLink> : undefined} />
        )}
      </Card>
    </div>
  );
}

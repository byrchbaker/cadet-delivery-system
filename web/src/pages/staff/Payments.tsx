import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard } from 'lucide-react';
import { money, shortDate, type OrderDTO } from '@cds/shared';
import { get, post } from '../../lib/api';
import { useOrders } from '../../lib/queries';
import { Button, Card, Empty, LoadingRows, PageHeader, PaymentBadge, Segmented } from '../../components/ui';
import { useToast } from '../../components/toast';

export default function PaymentsPage() {
  const [tab, setTab] = useState<'reported' | 'unpaid' | 'paid'>('reported');
  const { data: reported } = useOrders({ payment: 'reported', scope: 'all' });
  const { data: unpaid } = useOrders({ payment: 'unpaid', scope: 'all', status: 'requested,confirmed,picking_up,picked_up,en_route,delivered' });
  const { data: paid } = useOrders({ payment: 'paid', scope: 'all', limit: 100 });
  const { data: subs } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => get<{ id: number; cadet_id: number; first_name: string; last_name: string; label: string; starts_on: string; ends_on: string }[]>('/staff/subscriptions'),
  });
  const lists = { reported: reported ?? [], unpaid: (unpaid ?? []).filter((o) => o.totalCents > 0), paid: paid ?? [] };
  const list = lists[tab];
  const total = list.reduce((s, o) => s + o.totalCents, 0);

  return (
    <div className="content wide">
      <PageHeader eyebrow="Business" title="Payments" sub="Families pay the delivery fee by the methods in Settings → Payments and tap “I've sent it”. Verify here." />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} data-collapse>
        <Card
          pad={false}
          title={
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'reported', label: 'To verify', count: lists.reported.length },
                { value: 'unpaid', label: 'Unpaid', count: lists.unpaid.length },
                { value: 'paid', label: 'Paid' },
              ]}
            />
          }
          actions={<span className="mono strong">{money(total)}</span>}
        >
          {!reported ? (
            <LoadingRows />
          ) : list.length ? (
            <div className="list">
              {list.map((o) => (
                <PaymentRow key={o.id} order={o} />
              ))}
            </div>
          ) : (
            <Empty icon={<CreditCard />} title={tab === 'reported' ? 'Nothing to verify' : tab === 'unpaid' ? 'Nothing outstanding' : 'No payments yet'} />
          )}
        </Card>
        <Card eyebrow="Semester" title="Subscribers" pad={false}>
          {subs?.length ? (
            <div className="list">
              {subs.map((s) => (
                <Link key={s.id} to={`/app/people/${s.cadet_id}`} className="item">
                  <div style={{ flex: 1 }}>
                    <div className="strong">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="small muted">
                      {s.label} · until {shortDate(s.ends_on)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card-body small muted">Add a subscription from a cadet's page in People. Their orders are marked covered automatically.</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PaymentRow({ order }: { order: OrderDTO }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const mark = useMutation({
    mutationFn: (status: 'paid' | 'waived') => post(`/orders/${order.id}/payment`, { status }),
    onSuccess: () => {
      toast.ok('Updated');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(e),
  });
  const payer = order.payer ?? order.createdBy;
  return (
    <div className="item" style={{ flexWrap: 'wrap' }}>
      <button className="btn btn-ghost" style={{ flex: 1, minWidth: 220, justifyContent: 'flex-start', height: 'auto', padding: 0, textAlign: 'left', whiteSpace: 'normal' }} onClick={() => navigate(`/app/orders/${order.id}`)}>
        <span>
          <span className="strong" style={{ display: 'block' }}>
            {payer.firstName} {payer.lastName}
          </span>
          <span className="small muted" style={{ fontWeight: 400 }}>
            {order.serviceName} · {order.cadet.lastName} · {shortDate(order.serviceDate)} · <span className="mono">#{order.ref}</span>
            {order.paymentMethod && ` · via ${order.paymentMethod}`}
            {order.paymentRef && ` (${order.paymentRef})`}
          </span>
        </span>
      </button>
      <span className="mono strong">{money(order.totalCents)}</span>
      <PaymentBadge status={order.paymentStatus} short />
      {order.paymentStatus !== 'paid' && (
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="success" icon={<CheckCircle2 />} loading={mark.isPending} onClick={() => mark.mutate('paid')}>
            Paid
          </Button>
          <Button size="sm" onClick={() => mark.mutate('waived')}>
            Waive
          </Button>
        </div>
      )}
    </div>
  );
}

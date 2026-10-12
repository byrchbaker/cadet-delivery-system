import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageSquare, RotateCcw } from 'lucide-react';
import { relativeTime } from '@cds/shared';
import { get, post, qs } from '../../lib/api';
import { Button, Card, Empty, Segmented } from '../../components/ui';
import { useToast } from '../../components/toast';

interface Row {
  id: number;
  channel: 'sms' | 'email';
  event: string;
  to_address: string;
  title: string;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
  order_id: number | null;
  first_name: string | null;
  last_name: string | null;
}

const TONE = { sent: 'success', pending: 'info', failed: 'danger', skipped: 'warn' } as const;

export function OutboxTab() {
  const [status, setStatus] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ['outbox', status], queryFn: () => get<{ rows: Row[]; stats: { channel: string; status: string; n: number }[] }>(`/admin/outbox${qs({ status })}`), refetchInterval: 15_000 });
  const retry = useMutation({
    mutationFn: (id: number) => post(`/admin/outbox/${id}/retry`),
    onSuccess: () => {
      toast.ok('Queued to resend');
      qc.invalidateQueries({ queryKey: ['outbox'] });
    },
    onError: (e) => toast.error(e),
  });
  const stat = (channel: string, st: string) => data?.stats.find((s) => s.channel === channel && s.status === st)?.n ?? 0;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid grid-4 keep-2">
        {(['sms', 'email'] as const).map((c) => (
          <div key={c} className="card kpi">
            <div className="eyebrow">{c === 'sms' ? 'Texts' : 'Emails'} · 30 days</div>
            <div className="kpi-value">{stat(c, 'sent')}</div>
            <div className="kpi-note">
              sent · {stat(c, 'failed')} failed · {stat(c, 'skipped')} not sent (not set up)
            </div>
          </div>
        ))}
      </div>
      <Card
        eyebrow="Every text and email"
        title="Outbox"
        pad={false}
        actions={
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: 'All' },
              { value: 'failed', label: 'Failed' },
              { value: 'skipped', label: 'Not sent' },
            ]}
          />
        }
      >
        {!data?.rows.length ? (
          <Empty title="Nothing here yet">Messages appear here as the system sends them.</Empty>
        ) : (
          <div className="list">
            {data.rows.map((r) => (
              <div key={r.id} className="item" style={{ alignItems: 'flex-start' }}>
                {r.channel === 'sms' ? <MessageSquare size={18} color="var(--muted)" /> : <Mail size={18} color="var(--muted)" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="strong small">{r.first_name ? `${r.first_name} ${r.last_name}` : r.to_address}</span>
                    <span className="tiny muted mono">{r.to_address}</span>
                    <span className={`badge badge-${TONE[r.status]}`}>{r.status === 'skipped' ? 'not sent' : r.status}</span>
                    {r.order_id && (
                      <Link to={`/app/orders/${r.order_id}`} className="tiny">
                        order
                      </Link>
                    )}
                  </div>
                  <div className="small" style={{ marginTop: 2 }}>
                    {r.channel === 'email' ? <strong>{r.title} — </strong> : null}
                    <span className="muted">{r.body.length > 220 ? `${r.body.slice(0, 220)}…` : r.body}</span>
                  </div>
                  {r.error && <div className="tiny" style={{ color: 'var(--danger)', marginTop: 2 }}>{r.error}</div>}
                </div>
                <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
                  <span className="tiny faint nowrap">{relativeTime(r.created_at)}</span>
                  {(r.status === 'failed' || r.status === 'skipped') && (
                    <Button size="sm" icon={<RotateCcw />} onClick={() => retry.mutate(r.id)}>
                      Resend
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

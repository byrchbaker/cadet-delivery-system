import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Table2, BarChart3 } from 'lucide-react';
import { addDays, money, todayIn } from '@cds/shared';
import { get, qs } from '../../lib/api';
import { usePublicInfo } from '../../lib/queries';
import { BarList, ColumnChart } from '../../components/charts';
import { Button, Card, Empty, PageHeader, Segmented } from '../../components/ui';

interface Report {
  from: string;
  to: string;
  totals: { orders: number; collected: number; outstanding: number; tips: number; cadets: number; delivered: number };
  byService: { name: string; category: string; orders: number; revenue: number }[];
  byWeek: { week: string; orders: number; collected: number; billed: number }[];
  byWeekday: { dow: number; orders: number }[];
  byHelper: { name: string; delivered: number }[];
  topFamilies: { id: number; name: string; orders: number; revenue: number }[];
}

const RANGES = { '30': 30, '90': 90, '180': 180, '365': 365 } as const;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const compactMoney = (c: number) => (c >= 100_000 ? `$${(c / 100_000).toFixed(c >= 1_000_000 ? 0 : 1)}K` : money(c));
const shortWeek = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

export default function ReportsPage() {
  const { data: info } = usePublicInfo();
  const today = todayIn(info?.scheduling.timezone ?? 'America/Denver');
  const [range, setRange] = useState<keyof typeof RANGES>('90');
  const [asTable, setAsTable] = useState(false);
  const from = addDays(today, -RANGES[range] + 1);
  const { data, isFetching } = useQuery({
    queryKey: ['reports', from, today],
    queryFn: () => get<Report>(`/admin/reports${qs({ from, to: today })}`),
    placeholderData: (prev) => prev,
  });
  const t = data?.totals;

  return (
    <div className="content wide">
      <PageHeader
        eyebrow="Business"
        title="Reports"
        actions={
          <a className="btn" href={`/api/admin/export/orders.csv${qs({ from, to: today })}`} download>
            <Download /> Export orders (CSV)
          </a>
        }
      />
      <div className="row wrap" style={{ marginBottom: 18 }}>
        <Segmented
          value={range}
          onChange={setRange}
          label="Date range"
          options={[
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
            { value: '180', label: '6 months' },
            { value: '365', label: '12 months' },
          ]}
        />
      </div>

      <div style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
        <div className="grid grid-4 keep-2" style={{ marginBottom: 18 }}>
          <Tile label="Collected" value={t ? money(t.collected) : '—'} note={t ? `${money(t.tips)} in tips` : ''} />
          <Tile label="Outstanding" value={t ? money(t.outstanding) : '—'} note="unpaid or awaiting verification" />
          <Tile label="Orders" value={t ? t.orders.toLocaleString() : '—'} note={t ? `${t.delivered} delivered` : ''} />
          <Tile label="Cadets served" value={t ? t.cadets.toLocaleString() : '—'} note="distinct cadets" />
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <Card
            eyebrow="Revenue"
            title="Collected per week"
            actions={
              <Button size="sm" variant="ghost" icon={asTable ? <BarChart3 /> : <Table2 />} onClick={() => setAsTable((v) => !v)}>
                {asTable ? 'Chart' : 'Table'}
              </Button>
            }
          >
            {!data?.byWeek.length ? (
              <Empty title="No paid orders in this range" />
            ) : asTable ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Week of</th>
                      <th className="num">Orders</th>
                      <th className="num">Billed</th>
                      <th className="num">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byWeek.map((w) => (
                      <tr key={w.week}>
                        <td>{shortWeek(w.week)}</td>
                        <td className="num">{w.orders}</td>
                        <td className="num mono">{money(w.billed)}</td>
                        <td className="num mono">{money(w.collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ColumnChart
                ariaLabel="Collected revenue per week"
                format={compactMoney}
                data={data.byWeek.map((w) => ({ label: shortWeek(w.week), title: `Week of ${shortWeek(w.week)} · ${w.orders} orders`, value: w.collected }))}
              />
            )}
          </Card>

          <div className="grid grid-2" style={{ gap: 18 }}>
            <Card eyebrow="Mix" title="Revenue by service">
              {data?.byService.length ? (
                <BarList format={money} data={data.byService.map((s) => ({ label: s.name, title: `${s.name} · ${s.orders} orders`, value: s.revenue }))} />
              ) : (
                <Empty title="No orders yet" />
              )}
            </Card>
            <Card eyebrow="Demand" title="Orders by day of week">
              {data && data.byWeekday.length ? (
                <ColumnChart
                  ariaLabel="Orders by day of week"
                  format={(v) => String(Math.round(v))}
                  data={DOW.map((d, i) => ({ label: d, value: data.byWeekday.find((x) => x.dow === i)?.orders ?? 0 }))}
                />
              ) : (
                <Empty title="No orders yet" />
              )}
            </Card>
          </div>

          <div className="grid grid-2" style={{ gap: 18 }}>
            <Card eyebrow="Customers" title="Most active cadets" pad={false}>
              {data?.topFamilies.length ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cadet</th>
                      <th className="num">Orders</th>
                      <th className="num">Billed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topFamilies.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <Link to={`/app/people/${f.id}`}>{f.name}</Link>
                        </td>
                        <td className="num">{f.orders}</td>
                        <td className="num mono">{money(f.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty title="No orders yet" />
              )}
            </Card>
            <Card eyebrow="Team" title="Deliveries by driver">
              {data?.byHelper.length ? <BarList format={(v) => String(v)} data={data.byHelper.map((h) => ({ label: h.name, value: h.delivered }))} /> : <Empty title="No deliveries yet" />}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card kpi">
      <div className="eyebrow">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-note">{note}</div>
    </div>
  );
}

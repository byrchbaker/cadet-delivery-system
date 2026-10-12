import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Copy, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { addDays, money, shortDate, todayIn, zonedToUtc, type RunDTO } from '@cds/shared';
import { ApiError, del, post, put } from '../../lib/api';
import { useLocations, usePublicInfo, useRuns, useServices } from '../../lib/queries';
import { Button, Card, Clock, DateBlock, Empty, LoadingRows, Modal, PageHeader, SelectField, TextArea, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';

export default function RunsPage() {
  const { data: runs, isLoading } = useRuns(true);
  const { data: info } = usePublicInfo();
  const today = todayIn(info?.scheduling.timezone ?? 'America/Denver');
  const [editing, setEditing] = useState<RunDTO | 'new' | null>(null);
  const upcoming = runs?.filter((r) => r.runDate >= today) ?? [];
  const past = runs?.filter((r) => r.runDate < today) ?? [];

  return (
    <div className="content">
      <PageHeader
        eyebrow="Operations"
        title="Group runs"
        sub="Scheduled pickups families can join at a lower fee. Copy a run forward to repeat it weekly."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
            New group run
          </Button>
        }
      />
      <Card eyebrow="Upcoming" title="Scheduled runs" pad={false}>
        {isLoading ? (
          <LoadingRows />
        ) : upcoming.length ? (
          <div className="list">
            {upcoming.map((r) => (
              <RunRow key={r.id} run={r} onEdit={() => setEditing(r)} />
            ))}
          </div>
        ) : (
          <Empty icon={<Repeat />} title="No group runs scheduled" action={<Button variant="primary" onClick={() => setEditing('new')}>Schedule one</Button>}>
            Set up a weekly run — e.g. Tuesday Chick-fil-A at 1730 — and families can join it from the app.
          </Empty>
        )}
      </Card>
      {past.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card eyebrow="Recent" title="Past runs" pad={false}>
            <div className="list">
              {past
                .slice(-10)
                .reverse()
                .map((r) => (
                  <RunRow key={r.id} run={r} onEdit={() => setEditing(r)} />
                ))}
            </div>
          </Card>
        </div>
      )}
      {editing && <RunModal run={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RunRow({ run, onEdit }: { run: RunDTO; onEdit: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const dup = useMutation({
    mutationFn: (weeks: number) => post<{ created: number[] }>(`/runs/${run.id}/duplicate`, { weeks }),
    onSuccess: (r) => {
      toast.ok(`Scheduled ${r.created.length} more week${r.created.length > 1 ? 's' : ''}`);
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: () => del<{ cancelled: boolean }>(`/runs/${run.id}`),
    onSuccess: (r) => {
      toast.ok(r.cancelled ? 'Run cancelled (it had orders)' : 'Run deleted');
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });
  return (
    <div className="item" style={{ flexWrap: 'wrap' }}>
      <DateBlock date={run.runDate} time={run.pickupTime} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="strong row" style={{ gap: 8 }}>
          {run.title}
          {run.status !== 'open' ? <span className="badge badge-outline">{run.status}</span> : run.isOpen ? <span className="badge badge-success">Open</span> : <span className="badge badge-warn">Closed for orders</span>}
        </div>
        <div className="small muted">
          {shortDate(run.runDate)} · pickup <Clock time={run.pickupTime} compact /> · {run.serviceName} · {money(run.feeCents)}
          {run.location && ` · ${run.location.name}`}
        </div>
        <Link to={`/app/orders?scope=all&runId=${run.id}`} className="small strong">
          {run.orderCount} order{run.orderCount === 1 ? '' : 's'}
          {run.capacity > 0 && ` of ${run.capacity}`} →
        </Link>
      </div>
      <div className="row" style={{ gap: 4 }}>
        <Button size="sm" icon={<Copy />} loading={dup.isPending} onClick={() => dup.mutate(1)} title="Copy to next week">
          Next week
        </Button>
        <Button size="sm" iconOnly aria-label="Repeat for 4 weeks" title="Repeat for the next 4 weeks" onClick={() => dup.mutate(4)}>
          <CalendarPlus />
        </Button>
        <Button size="sm" iconOnly aria-label="Edit" onClick={onEdit}>
          <Pencil />
        </Button>
        <Button size="sm" iconOnly variant="ghost" aria-label="Delete" onClick={() => confirm('Delete or cancel this run?') && remove.mutate()}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function RunModal({ run, onClose }: { run: RunDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: services } = useServices(true);
  const { data: locations } = useLocations();
  const { data: info } = usePublicInfo();
  const tz = info?.scheduling.timezone ?? 'America/Denver';
  const foodServices = services ?? [];
  const [f, setF] = useState(() => ({
    title: run?.title ?? '',
    serviceId: run?.serviceId ?? foodServices[0]?.id ?? 0,
    vendor: run?.vendor ?? '',
    runDate: run?.runDate ?? addDays(todayIn(tz), 2),
    pickupTime: run?.pickupTime ?? '17:30',
    cutoffDate: run?.cutoffAt ? new Date(run.cutoffAt).toLocaleDateString('en-CA', { timeZone: tz }) : '',
    cutoffTime: run?.cutoffAt ? new Date(run.cutoffAt).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) : '',
    locationId: run?.location?.id ?? locations?.[0]?.id ?? null,
    capacity: run?.capacity ?? 0,
    fee: run ? (run.feeCents / 100).toFixed(2) : '',
    notes: run?.notes ?? '',
    status: run?.status ?? 'open',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: f.title,
        serviceId: Number(f.serviceId) || foodServices[0]?.id,
        vendor: f.vendor,
        runDate: f.runDate,
        pickupTime: f.pickupTime,
        cutoffAt: f.cutoffDate && f.cutoffTime ? zonedToUtc(f.cutoffDate, f.cutoffTime, tz).toISOString() : null,
        locationId: f.locationId,
        capacity: Number(f.capacity) || 0,
        feeCents: f.fee === '' ? null : Math.round(Number(f.fee) * 100),
        notes: f.notes,
        status: f.status,
      };
      return run ? put(`/runs/${run.id}`, body) : post('/runs', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      toast.ok(run ? 'Run updated' : 'Run scheduled');
      onClose();
    },
    onError: (e) => {
      setErrors((e as ApiError).fields ?? {});
      toast.error(e);
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const selectedService = foodServices.find((s) => s.id === Number(f.serviceId));
  return (
    <Modal
      open
      onClose={onClose}
      title={run ? 'Edit group run' : 'New group run'}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            {run ? 'Save' : 'Schedule run'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label="Title" wrapClass="full" value={f.title} onChange={set('title')} placeholder="Tuesday Chick-fil-A run" required error={errors.title} />
        <SelectField label="Service" value={String(f.serviceId)} onChange={set('serviceId')} options={foodServices.map((s) => ({ value: s.id, label: s.name }))} />
        <TextField label="Restaurant / store" value={f.vendor} onChange={set('vendor')} placeholder="Chick-fil-A — Interquest" />
        <TextField label="Run date" type="date" value={f.runDate} onChange={set('runDate')} required error={errors.runDate} />
        <TextField label="Pickup time" type="time" value={f.pickupTime} onChange={set('pickupTime')} required error={errors.pickupTime} />
        <TextField label="Order cutoff date" type="date" value={f.cutoffDate} onChange={set('cutoffDate')} optional help="Defaults to the pickup time." />
        <TextField label="Cutoff time" type="time" value={f.cutoffTime} onChange={set('cutoffTime')} optional />
        <SelectField label="Deliver to" value={f.locationId ?? ''} onChange={(e) => setF({ ...f, locationId: Number(e.target.value) || null })} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} />
        <TextField label="Max orders" type="number" min={0} value={f.capacity} onChange={set('capacity')} help="0 = no limit" />
        <TextField label="Delivery fee ($)" type="number" step="0.01" min={0} value={f.fee} onChange={set('fee')} placeholder={selectedService ? (selectedService.feeCents / 100).toFixed(2) : ''} help="Blank = service price." />
        <SelectField
          label="Status"
          value={f.status}
          onChange={set('status')}
          options={[
            { value: 'open', label: 'Open for orders' },
            { value: 'closed', label: 'Closed' },
            { value: 'done', label: 'Done' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <TextArea label="Notes for families" wrapClass="full" value={f.notes} onChange={set('notes')} placeholder="Order bottled drinks only. Use CADET LASTNAME as the order name." />
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Megaphone, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import { relativeTime, type AnnouncementDTO } from '@cds/shared';
import { del, patch, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAnnouncements, usePublicInfo } from '../lib/queries';
import { Button, Card, Empty, LoadingRows, PageHeader, SelectField, Switch, TextArea, TextField } from '../components/ui';
import { useToast } from '../components/toast';

export function NewsPage() {
  const { can } = useAuth();
  const { data, isLoading } = useAnnouncements();
  const canPost = can('announce');
  return (
    <div className="content">
      <PageHeader eyebrow="Communication" title="Announcements" sub={canPost ? 'Post once — it shows in the app and can go out by text and email. Copy it for Facebook in one click.' : 'Schedules, group runs and updates.'} />
      <div className="grid" style={{ gridTemplateColumns: canPost ? 'minmax(0, 1.3fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 18, alignItems: 'start' }} data-collapse>
        <div className="stack" style={{ gap: 14 }}>
          {isLoading && <Card><LoadingRows rows={2} /></Card>}
          {!isLoading && !data?.length && (
            <Card>
              <Empty icon={<Megaphone />} title="No announcements yet" />
            </Card>
          )}
          {data?.map((a) => <AnnouncementCard key={a.id} a={a} canEdit={canPost} />)}
        </div>
        {canPost && <Composer />}
      </div>
    </div>
  );
}

function AnnouncementCard({ a, canEdit }: { a: AnnouncementDTO; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: info } = usePublicInfo();
  const refresh = () => qc.invalidateQueries({ queryKey: ['announcements'] });
  const pin = useMutation({ mutationFn: () => patch(`/announcements/${a.id}`, { pinned: !a.pinned }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => del(`/announcements/${a.id}`), onSuccess: refresh });
  const copyForFacebook = () => {
    const text = `${a.title}\n\n${a.body}\n\nOrder & track: ${window.location.origin}\n— ${info?.profile.businessName ?? ''}`;
    void navigator.clipboard?.writeText(text);
    toast.ok('Copied — paste it into your Facebook post');
  };
  return (
    <article className="card" style={a.pinned ? { borderTop: '3px solid var(--primary)' } : undefined}>
      <div className="card-body stack" style={{ gap: 8 }}>
        <div className="row between top">
          <div>
            <div className="eyebrow">
              {a.pinned && 'Pinned · '}
              {relativeTime(a.createdAt)}
              {a.audience !== 'everyone' && ` · ${a.audience}`}
              {a.classYear && ` · Class of ${a.classYear}`}
            </div>
            <h2 className="display" style={{ fontSize: 22, marginTop: 4 }}>
              {a.title}
            </h2>
          </div>
          {canEdit && (
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" iconOnly aria-label="Copy for Facebook" title="Copy for Facebook" onClick={copyForFacebook}>
                <Copy />
              </Button>
              <Button size="sm" variant="ghost" iconOnly aria-label={a.pinned ? 'Unpin' : 'Pin'} onClick={() => pin.mutate()}>
                {a.pinned ? <PinOff /> : <Pin />}
              </Button>
              <Button size="sm" variant="ghost" iconOnly aria-label="Delete" onClick={() => confirm('Delete this announcement?') && remove.mutate()}>
                <Trash2 />
              </Button>
            </div>
          )}
        </div>
        <p className="pre">{a.body}</p>
        {a.delivery && (a.delivery.sms > 0 || a.delivery.email > 0) && (
          <div className="tiny faint">
            Sent to {a.delivery.sms} by text · {a.delivery.email} by email
          </div>
        )}
      </div>
    </article>
  );
}

function Composer() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: info } = usePublicInfo();
  const empty = { title: '', body: '', audience: 'everyone', classYear: '', pinned: false, sendSms: false, sendEmail: true };
  const [f, setF] = useState(empty);
  const submit = useMutation({
    mutationFn: () => post<AnnouncementDTO>('/announcements', f),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.ok(`Posted${a.delivery?.sms || a.delivery?.email ? ` · ${a.delivery?.sms ?? 0} texts, ${a.delivery?.email ?? 0} emails queued` : ''}`);
      setF(empty);
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card eyebrow="New" title="Post an announcement" className="accent">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required placeholder="Tuesday Chick-fil-A group run" />
        <TextArea label="Message" rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required placeholder="Order by Monday 2000 for a 1730 pickup…" />
        <div className="form-grid">
          <SelectField
            label="Audience"
            value={f.audience}
            onChange={(e) => setF({ ...f, audience: e.target.value })}
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'parents', label: 'Families only' },
              { value: 'cadets', label: 'Cadets only' },
              { value: 'helpers', label: 'Helpers only' },
            ]}
          />
          <SelectField
            label="Class"
            value={f.classYear}
            onChange={(e) => setF({ ...f, classYear: e.target.value })}
            options={(info?.lists.classYears ?? []).map((c) => ({ value: c, label: c }))}
            placeholder="All classes"
          />
        </div>
        <Switch checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label="Pin to the top" />
        <Switch checked={f.sendEmail} onChange={(v) => setF({ ...f, sendEmail: v })} label="Also email it" />
        <Switch checked={f.sendSms} onChange={(v) => setF({ ...f, sendSms: v })} label="Also text it" description="Use sparingly — texts cost money and people opt out." />
        <Button type="submit" variant="primary" icon={<Send />} loading={submit.isPending}>
          Post announcement
        </Button>
      </form>
    </Card>
  );
}

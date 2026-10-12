import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageSquare, RotateCcw } from 'lucide-react';
import { TEMPLATE_VARIABLES, renderTemplate, resolveTemplate, type TemplateDef, type TemplateKey, type TemplateOverride } from '@cds/shared';
import { del, get, put } from '../../lib/api';
import { Button, Card, Switch, TextArea, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';

const AUDIENCE_LABEL: Record<string, string> = {
  staff: 'To you & dispatch',
  organizer: 'To you',
  helper: 'To helpers',
  customer: 'To families',
  cadet: 'To the cadet',
  payer: 'To whoever pays',
  anyone: 'To everyone involved',
};

const SAMPLE: Record<string, string> = {
  business: 'Cadet Delivery',
  organizer: 'Organizer',
  driver: 'Sam',
  cadet: 'Jordan Smith',
  cadetFirst: 'Jordan',
  cadetLast: 'Cadet Smith',
  sender: 'Pat Smith',
  service: 'Individual food order',
  vendor: 'Chipotle',
  ref: '#K7Q4M',
  date: 'Fri, Oct 16',
  time: '5:30 PM (1730)',
  location: 'Arnold Hall — delivery shelf',
  eta: '5:45 PM',
  amount: '$20',
  paymentNote: 'Delivery fee $20 is due.',
  note: 'Top shelf, left side',
  link: 'https://your-site/t/abc123',
  message: 'Can you do 1800 instead?',
  title: 'Tuesday group run',
  name: 'Pat',
  method: 'Venmo',
};

export function TemplatesTab() {
  const { data } = useQuery({
    queryKey: ['admin-templates'],
    queryFn: () => get<{ defaults: Record<TemplateKey, TemplateDef>; overrides: Partial<Record<TemplateKey, TemplateOverride>> }>('/admin/templates'),
  });
  const [key, setKey] = useState<TemplateKey>('en_route');
  if (!data) return <Card><div className="spinner" /></Card>;
  const keys = Object.keys(data.defaults) as TemplateKey[];
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} data-collapse>
      <Card pad={false}>
        <div className="list" style={{ maxHeight: 640, overflow: 'auto' }}>
          {keys.map((k) => {
            const t = resolveTemplate(k, data.overrides[k]);
            return (
              <button key={k} className="item" onClick={() => setKey(k)} style={key === k ? { background: 'var(--primary-soft)', boxShadow: 'inset 3px 0 0 var(--primary)' } : undefined}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong small">{t.label}</div>
                  <div className="tiny muted">{AUDIENCE_LABEL[t.audience]}</div>
                </div>
                <span className="row" style={{ gap: 4, color: 'var(--muted)' }}>
                  {t.channels.sms && <MessageSquare size={14} aria-label="Text" />}
                  {t.channels.email && <Mail size={14} aria-label="Email" />}
                  {data.overrides[k] && <span className="badge badge-info" style={{ height: 18, fontSize: 10.5 }}>Edited</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      <Editor key={key} k={key} def={data.defaults[key]} override={data.overrides[key]} />
    </div>
  );
}

function Editor({ k, def, override }: { k: TemplateKey; def: TemplateDef; override?: TemplateOverride }) {
  const qc = useQueryClient();
  const toast = useToast();
  const current = resolveTemplate(k, override);
  const [f, setF] = useState({ sms: current.sms, subject: current.subject, email: current.email, channels: { ...current.channels } });
  const [focus, setFocus] = useState<'sms' | 'subject' | 'email'>('sms');
  const refs = { sms: useRef<HTMLTextAreaElement>(null), email: useRef<HTMLTextAreaElement>(null) };
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-templates'] });
  const save = useMutation({ mutationFn: () => put(`/admin/templates/${k}`, f), onSuccess: () => { refresh(); toast.ok('Template saved'); }, onError: (e) => toast.error(e) });
  const reset = useMutation({
    mutationFn: () => del(`/admin/templates/${k}`),
    onSuccess: () => {
      refresh();
      setF({ sms: def.sms, subject: def.subject, email: def.email, channels: { ...def.channels } });
      toast.ok('Reset to default');
    },
  });
  const smsPreview = useMemo(() => renderTemplate(f.sms, SAMPLE), [f.sms]);
  const segments = Math.max(1, Math.ceil(smsPreview.length / 160));

  const insert = (v: string) => {
    const token = `{${v}}`;
    if (focus === 'subject') return setF({ ...f, subject: f.subject + token });
    const el = refs[focus].current;
    const text = f[focus];
    const pos = el?.selectionStart ?? text.length;
    setF({ ...f, [focus]: text.slice(0, pos) + token + text.slice(el?.selectionEnd ?? pos) });
  };

  return (
    <Card
      eyebrow={AUDIENCE_LABEL[def.audience]}
      title={def.label}
      actions={
        override && (
          <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => reset.mutate()}>
            Reset to default
          </Button>
        )
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <p className="small muted">{def.description}</p>
        <div className="grid grid-2">
          <Switch checked={f.channels.sms} onChange={(v) => setF({ ...f, channels: { ...f.channels, sms: v } })} label="Send as a text" />
          <Switch checked={f.channels.email} onChange={(v) => setF({ ...f, channels: { ...f.channels, email: v } })} label="Send as an email" />
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Insert a detail
          </div>
          <div className="var-chips">
            {Object.entries(TEMPLATE_VARIABLES).map(([v, desc]) => (
              <button key={v} type="button" className="var-chip" title={desc} onClick={() => insert(v)}>
                {`{${v}}`}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <TextArea ref={refs.sms} label="Text message" rows={4} value={f.sms} onFocus={() => setFocus('sms')} onChange={(e) => setF({ ...f, sms: e.target.value })} help={`${smsPreview.length} characters · ${segments} SMS segment${segments > 1 ? 's' : ''}`} />
          <div>
            <div className="label" style={{ marginBottom: 6 }}>
              Preview
            </div>
            <div className="sms-preview">{smsPreview}</div>
          </div>
        </div>
        <TextField label="Email subject" value={f.subject} onFocus={() => setFocus('subject')} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <TextArea ref={refs.email} label="Email body" rows={7} value={f.email} onFocus={() => setFocus('email')} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save template
          </Button>
        </div>
      </div>
    </Card>
  );
}

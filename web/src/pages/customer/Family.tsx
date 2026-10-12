import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Link2, Mail, Pencil, Phone, Plus, Send, UserPlus, Users } from 'lucide-react';
import { formatPhone, type UserDTO } from '@cds/shared';
import { ApiError, del, patch, post } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { useFamily, usePublicInfo } from '../../lib/queries';
import { Alert, Avatar, Button, Card, Empty, LoadingRows, Modal, PageHeader, SelectField, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';

export function FamilyPage() {
  const user = useUser();
  const { data, isLoading } = useFamily();
  const [params] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserDTO | null>(null);
  const isParent = user.role === 'parent';
  const welcome = params.get('welcome') === '1';

  return (
    <div className="content">
      <PageHeader
        eyebrow="Family"
        title={isParent ? 'Your cadets & family' : 'Your family'}
        sub={isParent ? 'Link with your cadet to order for them, send surprises, and see their deliveries.' : 'Family members you link with can order for you and cover delivery fees.'}
      />
      {welcome && (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="success" title="Welcome aboard">
            Next, connect with your cadet: enter their family code, send them an invite, or add their details yourself.
          </Alert>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} data-collapse>
        <div className="stack" style={{ gap: 18 }}>
          {isParent && (
            <Card
              eyebrow="Cadets"
              title="Linked cadets"
              pad={false}
              actions={
                <Button size="sm" icon={<Plus />} onClick={() => setAddOpen(true)}>
                  Add details
                </Button>
              }
            >
              {isLoading ? (
                <LoadingRows rows={2} />
              ) : data?.cadets.length ? (
                <div className="list">
                  {data.cadets.map((c) => (
                    <CadetRow key={c.id} cadet={c} onEdit={() => setEditing(c)} />
                  ))}
                </div>
              ) : (
                <Empty icon={<UserPlus />} title="No cadets linked yet">
                  Use your cadet's family code, send them an invite link, or add their details yourself.
                </Empty>
              )}
            </Card>
          )}
          <Card eyebrow={isParent ? 'Other family members' : 'Parents & family'} title={isParent ? 'Co-parents' : 'Linked family'} pad={false}>
            {data?.parents.length ? (
              <div className="list">
                {data.parents.map((p) => (
                  <PersonRow key={p.id} person={p} canUnlink={!isParent} />
                ))}
              </div>
            ) : (
              <Empty icon={<Users />} title={isParent ? 'No one else yet' : 'No family linked yet'}>
                {isParent ? 'Other parents who link with your cadet appear here.' : 'Share your family code with a parent so they can order for you.'}
              </Empty>
            )}
          </Card>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <InviteCard />
          <RedeemCard />
        </div>
      </div>
      <ManagedCadetModal open={addOpen} onClose={() => setAddOpen(false)} />
      {editing && <ManagedCadetModal open cadet={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CadetRow({ cadet, onEdit }: { cadet: UserDTO; onEdit: () => void }) {
  const toast = useToast();
  const [link, setLink] = useState('');
  const invite = useMutation({
    mutationFn: () => post<{ code: string; url: string }>('/family/invite', { forCadetId: cadet.id }),
    onSuccess: (r) => setLink(r.url),
    onError: (e) => toast.error(e),
  });
  return (
    <div className="item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Avatar first={cadet.firstName} last={cadet.lastName} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="strong">
            {cadet.firstName} {cadet.lastName}
          </span>
          {cadet.managed ? <span className="badge badge-outline">Added by you</span> : <span className="badge badge-success">Has an account</span>}
        </div>
        <div className="small muted">
          {[cadet.cadet?.classYear && `Class of ${cadet.cadet.classYear}`, cadet.cadet?.squadron, cadet.cadet?.dorm].filter(Boolean).join(' · ')}
        </div>
        <div className="small muted row" style={{ gap: 6 }}>
          <Phone size={13} /> {formatPhone(cadet.phone)}
        </div>
        {link && <CopyBox label={`Send this to ${cadet.firstName} so they can set up their login`} value={link} />}
      </div>
      {cadet.managed && (
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" icon={<Pencil />} onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" icon={<Send />} loading={invite.isPending} onClick={() => invite.mutate()}>
            Invite
          </Button>
        </div>
      )}
    </div>
  );
}

function PersonRow({ person, canUnlink }: { person: UserDTO; canUnlink: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const unlink = useMutation({
    mutationFn: () => del(`/family/links/${person.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      toast.ok('Unlinked');
    },
  });
  return (
    <div className="item">
      <Avatar first={person.firstName} last={person.lastName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="strong">
          {person.firstName} {person.lastName}
        </div>
        <div className="small muted">{[formatPhone(person.phone), person.email].filter(Boolean).join(' · ')}</div>
      </div>
      {canUnlink && (
        <Button size="sm" variant="ghost" onClick={() => confirm(`Unlink ${person.firstName}?`) && unlink.mutate()}>
          Unlink
        </Button>
      )}
    </div>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <div className="stack" style={{ gap: 6, marginTop: 10 }}>
      <div className="small muted">{label}</div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input mono small" readOnly value={value} onFocus={(e) => e.target.select()} />
        <Button
          iconOnly
          aria-label="Copy"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast.ok('Copied');
          }}
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}

function InviteCard() {
  const user = useUser();
  const toast = useToast();
  const [invite, setInvite] = useState<{ code: string; url: string } | null>(null);
  const create = useMutation({ mutationFn: () => post<{ code: string; url: string }>('/family/invite', {}), onSuccess: setInvite, onError: (e) => toast.error(e) });
  const other = user.role === 'parent' ? 'your cadet' : 'a parent or family member';
  const share = async () => {
    if (!invite) return;
    const text = `Join me on the cadet delivery app so we can share orders: ${invite.url}`;
    if (navigator.share) await navigator.share({ text }).catch(() => {});
    else {
      void navigator.clipboard?.writeText(text);
      toast.ok('Invite copied');
    }
  };
  return (
    <Card eyebrow="Invite" title={`Invite ${other}`}>
      <div className="stack">
        <p className="small muted">Share a link or code. When they sign up or enter the code, your accounts are linked. Codes last 3 weeks.</p>
        {invite ? (
          <>
            <div className="card inset" style={{ padding: 14, textAlign: 'center' }}>
              <div className="eyebrow plain" style={{ justifyContent: 'center' }}>
                Family code
              </div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--primary)' }}>
                {invite.code}
              </div>
            </div>
            <CopyBox label="Or share this link" value={invite.url} />
            <Button variant="primary" icon={<Send />} onClick={share}>
              Share invite
            </Button>
          </>
        ) : (
          <Button variant="primary" icon={<Link2 />} loading={create.isPending} onClick={() => create.mutate()}>
            Create invite
          </Button>
        )}
      </div>
    </Card>
  );
}

function RedeemCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const redeem = useMutation({
    mutationFn: () => post<{ linked: UserDTO }>('/family/redeem', { code }),
    onSuccess: (r) => {
      toast.ok(`Linked with ${r.linked.firstName}`);
      setCode('');
      setError('');
      qc.invalidateQueries({ queryKey: ['family'] });
    },
    onError: (e) => setError((e as ApiError).message),
  });
  return (
    <Card eyebrow="Have a code?" title="Enter a family code">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          redeem.mutate();
        }}
      >
        <TextField
          placeholder="e.g. 7KQ4MXP2"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mono"
          error={error}
          aria-label="Family code"
          style={{ letterSpacing: '0.1em' }}
        />
        <Button type="submit" icon={<KeyRound />} disabled={code.length < 4} loading={redeem.isPending}>
          Link accounts
        </Button>
      </form>
    </Card>
  );
}

function ManagedCadetModal({ open, onClose, cadet }: { open: boolean; onClose: () => void; cadet?: UserDTO }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: info } = usePublicInfo();
  const [f, setF] = useState({
    firstName: cadet?.firstName ?? '',
    lastName: cadet?.lastName ?? '',
    phone: cadet?.phone ?? '',
    email: cadet?.email ?? '',
    classYear: cadet?.cadet?.classYear ?? '',
    squadron: cadet?.cadet?.squadron ?? '',
    dorm: cadet?.cadet?.dorm ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => (cadet ? patch(`/family/cadets/${cadet.id}`, f) : post('/family/cadets', f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family'] });
      toast.ok(cadet ? 'Saved' : `${f.firstName} added`);
      onClose();
    },
    onError: (e) => {
      setErrors((e as ApiError).fields ?? {});
      toast.error(e);
    },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const lists = info?.lists;
  const opt = (a?: string[]) => (a ?? []).map((v) => ({ value: v, label: v }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cadet ? `Edit ${cadet.firstName}` : 'Add your cadet'}
      width={600}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            {cadet ? 'Save' : 'Add cadet'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {!cadet && <p className="small muted">Your cadet doesn't need an account — delivery texts go to their phone. You can invite them to sign in later.</p>}
        <div className="form-grid">
          <TextField label="First name" value={f.firstName} onChange={set('firstName')} required error={errors.firstName} />
          <TextField label="Last name" value={f.lastName} onChange={set('lastName')} required error={errors.lastName} />
          <TextField label="Cadet's mobile" type="tel" value={f.phone} onChange={set('phone')} required error={errors.phone} />
          <TextField label="Cadet's email" type="email" value={f.email} onChange={set('email')} optional error={errors.email} />
          {lists?.classYears.length ? <SelectField label="Class" value={f.classYear} onChange={set('classYear')} options={opt(lists.classYears)} placeholder="Choose…" /> : <TextField label="Class year" value={f.classYear} onChange={set('classYear')} />}
          {lists?.squadrons.length ? <SelectField label="Squadron" value={f.squadron} onChange={set('squadron')} options={opt(lists.squadrons)} placeholder="Choose…" /> : <TextField label="Squadron" value={f.squadron} onChange={set('squadron')} />}
          {lists?.dorms.length ? (
            <SelectField label="Dormitory" wrapClass="full" value={f.dorm} onChange={set('dorm')} options={opt(lists.dorms)} placeholder="Choose…" />
          ) : (
            <TextField label="Dormitory" wrapClass="full" value={f.dorm} onChange={set('dorm')} />
          )}
        </div>
        <p className="help row" style={{ gap: 6 }}>
          <Mail size={13} /> If you add their email, they can also use “Forgot password” to claim the account.
        </p>
      </div>
    </Modal>
  );
}

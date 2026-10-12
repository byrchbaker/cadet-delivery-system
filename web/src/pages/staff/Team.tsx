import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Copy, Crown, Link2, RotateCcw, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react';
import { DEFAULT_HELPER_PERMISSIONS, HELPER_PERMISSIONS, HELPER_PERMISSION_KEYS, formatPhone, relativeTime, type HelperPermission, type UserDTO } from '@cds/shared';
import { del, get, patch, post } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { Avatar, Button, Card, Empty, LoadingRows, Modal, PageHeader } from '../../components/ui';
import { useToast } from '../../components/toast';

type Member = UserDTO & { applicationNote: string | null; deliveredCount: number; openCount: number };
interface TeamData {
  members: Member[];
  invites: { code: string; url: string; permissions: HelperPermission[]; expiresAt: string }[];
}

export default function TeamPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-team'], queryFn: () => get<TeamData>('/admin/team') });
  const [inviteOpen, setInviteOpen] = useState(false);
  const pending = data?.members.filter((m) => m.status === 'pending') ?? [];
  const active = data?.members.filter((m) => m.status === 'active') ?? [];
  const inactive = data?.members.filter((m) => m.status === 'suspended') ?? [];

  return (
    <div className="content wide">
      <PageHeader
        eyebrow="Business"
        title="Team"
        sub="Approve helpers and choose exactly what each one can do. Helpers only ever see what their permissions allow."
        actions={
          <Button variant="primary" icon={<Link2 />} onClick={() => setInviteOpen(true)}>
            Invite a helper
          </Button>
        }
      />
      {isLoading && <Card><LoadingRows /></Card>}

      {pending.length > 0 && (
        <div className="stack" style={{ gap: 14, marginBottom: 22 }}>
          <div className="eyebrow">Applications awaiting approval ({pending.length})</div>
          {pending.map((m) => (
            <Application key={m.id} member={m} />
          ))}
        </div>
      )}

      <Card eyebrow="Active" title="Your team" pad={false}>
        {active.length ? (
          <div className="list">
            {active.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </div>
        ) : (
          !isLoading && <Empty title="No team members yet" />
        )}
      </Card>

      {!!data?.invites.length && (
        <div style={{ marginTop: 18 }}>
          <Card eyebrow="Pending invites" title="Invite links" pad={false}>
            <div className="list">
              {data.invites.map((i) => (
                <InviteRow key={i.code} invite={i} />
              ))}
            </div>
          </Card>
        </div>
      )}

      {inactive.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card eyebrow="Deactivated" title="Former helpers" pad={false}>
            <div className="list">
              {inactive.map((m) => (
                <MemberRow key={m.id} member={m} />
              ))}
            </div>
          </Card>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Card eyebrow="Reference" title="What each permission allows">
          <dl className="kv">
            {HELPER_PERMISSION_KEYS.map((k) => (
              <Perm key={k} k={k} />
            ))}
          </dl>
        </Card>
      </div>
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function Perm({ k }: { k: HelperPermission }) {
  return (
    <>
      <dt className="strong" style={{ color: 'var(--ink)' }}>
        {HELPER_PERMISSIONS[k].label}
      </dt>
      <dd className="muted">{HELPER_PERMISSIONS[k].description}</dd>
    </>
  );
}

function PermissionPicker({ value, onChange, disabled }: { value: HelperPermission[]; onChange: (v: HelperPermission[]) => void; disabled?: boolean }) {
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {HELPER_PERMISSION_KEYS.map((k) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            className="chip"
            aria-pressed={on}
            disabled={disabled}
            title={HELPER_PERMISSIONS[k].description}
            onClick={() => onChange(on ? value.filter((p) => p !== k) : [...value, k])}
          >
            {on && <Check size={13} />}
            {HELPER_PERMISSIONS[k].label}
          </button>
        );
      })}
    </div>
  );
}

function useTeamMutation<T>(fn: (v: T) => Promise<unknown>, msg: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-team'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['staff-team'] });
      toast.ok(msg);
    },
    onError: (e) => toast.error(e),
  });
}

function Application({ member }: { member: Member }) {
  const [perms, setPerms] = useState<HelperPermission[]>(DEFAULT_HELPER_PERMISSIONS);
  const approve = useTeamMutation(() => post(`/admin/team/${member.id}/approve`, { permissions: perms }), `${member.firstName} approved — they've been notified`);
  const decline = useTeamMutation(() => del(`/admin/team/${member.id}`), 'Application removed');
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--warn)' }}>
      <div className="card-body stack" style={{ gap: 14 }}>
        <div className="row top" style={{ gap: 12 }}>
          <Avatar first={member.firstName} last={member.lastName} />
          <div style={{ flex: 1 }}>
            <div className="strong">
              {member.firstName} {member.lastName}
            </div>
            <div className="small muted">
              {formatPhone(member.phone)} · {member.email} · applied {relativeTime(member.createdAt)}
            </div>
            {member.applicationNote && (
              <blockquote className="small" style={{ margin: '8px 0 0', padding: '8px 12px', background: 'var(--surface-2)', borderLeft: '3px solid var(--accent)', borderRadius: 4 }}>
                {member.applicationNote}
              </blockquote>
            )}
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Give them access to
          </div>
          <PermissionPicker value={perms} onChange={setPerms} />
        </div>
        <div className="row">
          <Button variant="primary" icon={<UserCheck />} loading={approve.isPending} onClick={() => approve.mutate(undefined)}>
            Approve
          </Button>
          <Button variant="danger" icon={<X />} loading={decline.isPending} onClick={() => confirm(`Decline ${member.firstName}'s application?`) && decline.mutate(undefined)}>
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: Member }) {
  const me = useUser();
  const [perms, setPerms] = useState<HelperPermission[]>(member.permissions);
  const dirty = perms.slice().sort().join() !== member.permissions.slice().sort().join();
  const save = useTeamMutation((body: Record<string, unknown>) => patch(`/admin/team/${member.id}`, body), 'Team updated');
  const isOrganizer = member.role === 'organizer';
  return (
    <div className="item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Avatar first={member.firstName} last={member.lastName} staff={isOrganizer} />
      <div style={{ flex: 1, minWidth: 260 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="strong">
            {member.firstName} {member.lastName}
            {member.id === me.id && <span className="muted"> (you)</span>}
          </span>
          {isOrganizer ? (
            <span className="badge badge-primary">
              <Crown size={12} /> Organizer
            </span>
          ) : (
            <span className="badge badge-outline">Helper</span>
          )}
          {member.status === 'suspended' && <span className="badge badge-danger">Deactivated</span>}
        </div>
        <div className="small muted">
          {formatPhone(member.phone)} · {member.deliveredCount} delivered · {member.openCount} open
        </div>
        {!isOrganizer && member.status === 'active' && (
          <div style={{ marginTop: 10 }}>
            <PermissionPicker value={perms} onChange={setPerms} />
            {dirty && (
              <div className="row" style={{ marginTop: 8 }}>
                <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate({ permissions: perms })}>
                  Save access
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPerms(member.permissions)}>
                  Undo
                </Button>
              </div>
            )}
          </div>
        )}
        {isOrganizer && <div className="small muted" style={{ marginTop: 4 }}>Full access, including settings, team and reports.</div>}
      </div>
      {member.id !== me.id && (
        <div className="row wrap" style={{ gap: 6 }}>
          {member.status === 'active' && !isOrganizer && (
            <Button size="sm" icon={<ShieldCheck />} onClick={() => confirm(`Make ${member.firstName} a co-organizer with full access?`) && save.mutate({ role: 'organizer' })}>
              Make organizer
            </Button>
          )}
          {member.status === 'active' && isOrganizer && (
            <Button size="sm" onClick={() => save.mutate({ role: 'helper' })}>
              Make helper
            </Button>
          )}
          {member.status === 'active' ? (
            <Button size="sm" variant="danger" icon={<Ban />} onClick={() => confirm(`Deactivate ${member.firstName}? Their unstarted deliveries go back to the open pool.`) && save.mutate({ status: 'suspended' })}>
              Deactivate
            </Button>
          ) : (
            <Button size="sm" icon={<RotateCcw />} onClick={() => save.mutate({ status: 'active' })}>
              Reactivate
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function InviteRow({ invite }: { invite: TeamData['invites'][number] }) {
  const toast = useToast();
  const revoke = useTeamMutation(() => del(`/admin/team/invites/${invite.code}`), 'Invite revoked');
  return (
    <div className="item" style={{ flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div className="mono small">{invite.url}</div>
        <div className="small muted">
          {invite.permissions.map((p) => HELPER_PERMISSIONS[p].label).join(', ')} · expires {relativeTime(invite.expiresAt)}
        </div>
      </div>
      <Button size="sm" icon={<Copy />} onClick={() => { void navigator.clipboard?.writeText(invite.url); toast.ok('Copied'); }}>
        Copy
      </Button>
      <Button size="sm" variant="ghost" iconOnly aria-label="Revoke" onClick={() => revoke.mutate(undefined)}>
        <Trash2 />
      </Button>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [perms, setPerms] = useState<HelperPermission[]>(DEFAULT_HELPER_PERMISSIONS);
  const [url, setUrl] = useState('');
  const create = useMutation({
    mutationFn: () => post<{ url: string }>('/admin/team/invite', { permissions: perms }),
    onSuccess: (r) => {
      setUrl(r.url);
      qc.invalidateQueries({ queryKey: ['admin-team'] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title="Invite a helper" footer={url ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>Create invite link</Button></>}>
      {url ? (
        <div className="stack">
          <p>Send this link to your helper. It works once and expires in 14 days. They'll be approved automatically with the access you chose.</p>
          <div className="row" style={{ gap: 6 }}>
            <input className="input mono small" readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button iconOnly aria-label="Copy" onClick={() => { void navigator.clipboard?.writeText(url); toast.ok('Copied'); }}>
              <Copy />
            </Button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="muted small">Pre-approve someone you trust. Anyone can also apply from the sign-up page — you'll approve those here.</p>
          <div className="label">Access</div>
          <PermissionPicker value={perms} onChange={setPerms} />
        </div>
      )}
    </Modal>
  );
}

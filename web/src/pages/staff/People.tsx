import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { formatPhone, type UserDTO } from '@cds/shared';
import { ApiError, get, post, qs } from '../../lib/api';
import { usePublicInfo } from '../../lib/queries';
import { Avatar, Button, Card, Empty, LoadingRows, Modal, PageHeader, Segmented, SelectField, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';

type PersonRow = UserDTO & { orderCount: number; family: { id: number; firstName: string; lastName: string }[] };

export default function PeoplePage() {
  const [params, setParams] = useSearchParams();
  const [role, setRole] = useState<'all' | 'parent' | 'cadet'>('all');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['people', role, q],
    queryFn: () => get<PersonRow[]>(`/staff/people${qs({ role: role === 'all' ? undefined : role, q })}`),
  });
  const addOpen = params.get('add') === '1';

  return (
    <div className="content wide">
      <PageHeader
        eyebrow="Business"
        title="People"
        sub="Every family and cadet. Add people who reach you by text or Facebook so their orders live here too."
        actions={
          <Button variant="primary" icon={<UserPlus />} onClick={() => setParams({ add: '1' })}>
            Add a family
          </Button>
        }
      />
      <div className="row wrap" style={{ marginBottom: 14, gap: 12 }}>
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'cadet', label: 'Cadets' },
            { value: 'parent', label: 'Families' },
          ]}
        />
        <div className="input-group" style={{ flex: 1, maxWidth: 380 }}>
          <span className="addon">
            <Search size={16} />
          </span>
          <input className="input" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        </div>
      </div>
      <Card pad={false}>
        {isLoading ? (
          <LoadingRows />
        ) : !data?.length ? (
          <Empty icon={<Users />} title="No one here yet">Families appear as they sign up or when you add them.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Linked</th>
                  <th className="num">Orders</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/app/people/${p.id}`)}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar first={p.firstName} last={p.lastName} size="sm" />
                        <div>
                          <div className="strong">
                            {p.firstName} {p.lastName}
                          </div>
                          {p.cadet && <div className="small muted">{[p.cadet.classYear, p.cadet.squadron].filter(Boolean).join(' · ')}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-outline">{p.role === 'cadet' ? 'Cadet' : 'Family'}</span>
                      {p.managed && <span className="badge" style={{ marginLeft: 4 }}>No login</span>}
                      {p.status === 'suspended' && <span className="badge badge-danger" style={{ marginLeft: 4 }}>Inactive</span>}
                    </td>
                    <td className="small">
                      <div>{formatPhone(p.phone)}</div>
                      <div className="muted">{p.email}</div>
                    </td>
                    <td className="small">{p.family.map((f) => `${f.firstName} ${f.lastName}`).join(', ') || <span className="faint">—</span>}</td>
                    <td className="num mono">{p.orderCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {addOpen && <AddFamilyModal onClose={() => setParams({})} />}
    </div>
  );
}

function AddFamilyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: info } = usePublicInfo();
  const [c, setC] = useState({ firstName: '', lastName: '', phone: '', email: '', classYear: '', squadron: '', dorm: '' });
  const [p, setP] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [withParent, setWithParent] = useState(true);
  const save = useMutation({
    mutationFn: () => post<{ cadetId: number }>('/staff/customers', { cadet: c, parent: withParent ? p : undefined }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['people'] });
      toast.ok('Added');
      navigate(`/app/people/${r.cadetId}`);
    },
    onError: (e) => toast.error((e as ApiError).message),
  });
  const opt = (a?: string[]) => (a ?? []).map((v) => ({ value: v, label: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a family"
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Add
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        <p className="small muted">They don't need an account — texts go to these numbers. If you add an email, they can claim the account later with “Forgot password”.</p>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Cadet
          </div>
          <div className="form-grid">
            <TextField label="First name" value={c.firstName} onChange={(e) => setC({ ...c, firstName: e.target.value })} required />
            <TextField label="Last name" value={c.lastName} onChange={(e) => setC({ ...c, lastName: e.target.value })} required />
            <TextField label="Mobile" type="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} required />
            <TextField label="Email" type="email" optional value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
            <SelectField label="Class" value={c.classYear} onChange={(e) => setC({ ...c, classYear: e.target.value })} options={opt(info?.lists.classYears)} placeholder="—" />
            <SelectField label="Squadron" value={c.squadron} onChange={(e) => setC({ ...c, squadron: e.target.value })} options={opt(info?.lists.squadrons)} placeholder="—" />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={withParent} onChange={(e) => setWithParent(e.target.checked)} />
          <span className="strong">Also add a parent / family member</span>
        </label>
        {withParent && (
          <div className="form-grid">
            <TextField label="First name" value={p.firstName} onChange={(e) => setP({ ...p, firstName: e.target.value })} required />
            <TextField label="Last name" value={p.lastName} onChange={(e) => setP({ ...p, lastName: e.target.value })} required />
            <TextField label="Mobile" type="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} required />
            <TextField label="Email" type="email" optional value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
          </div>
        )}
      </div>
    </Modal>
  );
}

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Inbox as InboxIcon, Mail, MessageSquarePlus, Paperclip, Phone, Search, Send, Smartphone } from 'lucide-react';
import { formatPhone, relativeTime, type MessageDTO, type ThreadDTO, type UserDTO } from '@cds/shared';
import { api, get, post, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useThread, useThreads } from '../lib/queries';
import { Avatar, Button, Empty, Field, Modal, PageHeader, Segmented, Skeleton } from '../components/ui';
import { useToast } from '../components/toast';

export function InboxPage() {
  const params = useParams();
  const threadId = Number(params.threadId) || 0;
  const { data: threads, isLoading } = useThreads();
  const { staff, can } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [q, setQ] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);

  // Customers usually have a single thread — open it straight away on desktop.
  useEffect(() => {
    if (!threadId && !staff && threads?.length && window.innerWidth > 860) navigate(`/app/inbox/${threads[0].id}`, { replace: true });
  }, [threadId, staff, threads, navigate]);

  const visible = useMemo(() => {
    let list = threads ?? [];
    if (filter === 'unread') list = list.filter((t) => t.unread > 0);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((t) => `${t.title} ${t.subtitle} ${t.lastMessage?.body ?? ''}`.toLowerCase().includes(needle));
    }
    return list;
  }, [threads, filter, q]);
  const unreadCount = threads?.filter((t) => t.unread > 0).length ?? 0;

  return (
    <div className="content wide">
      <PageHeader
        eyebrow="Communication"
        title={staff ? 'Inbox' : 'Messages'}
        sub={staff ? 'Every conversation in one place — including replies to delivery texts.' : 'Questions, changes and special requests.'}
        actions={
          staff && can('inbox') ? (
            <Button icon={<MessageSquarePlus />} onClick={() => setComposeOpen(true)}>
              New message
            </Button>
          ) : undefined
        }
      />
      <div className={`card inbox ${threadId ? 'has-thread' : ''}`}>
        <div className="inbox-list">
          <div className="stack" style={{ padding: 12, gap: 10, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <div className="input-group">
              <span className="addon">
                <Search size={16} />
              </span>
              <input className="input" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
            </div>
            {staff && (
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'unread', label: 'Unread', count: unreadCount },
                ]}
              />
            )}
          </div>
          {isLoading && (
            <div className="stack" style={{ padding: 16 }}>
              <Skeleton h={40} />
              <Skeleton h={40} />
            </div>
          )}
          {!isLoading && !visible.length && <Empty icon={<InboxIcon />} title="No conversations">{filter === 'unread' ? 'Nothing unread.' : 'Messages will appear here.'}</Empty>}
          {visible.map((t) => (
            <ThreadItem key={t.id} t={t} active={t.id === threadId} />
          ))}
        </div>
        <div className="conversation">
          {threadId ? (
            <Conversation threadId={threadId} showBack />
          ) : (
            <Empty icon={<InboxIcon />} title="Select a conversation">
              Pick a conversation on the left.
            </Empty>
          )}
        </div>
      </div>
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}

function ThreadItem({ t, active }: { t: ThreadDTO; active: boolean }) {
  return (
    <Link to={`/app/inbox/${t.id}`} className={`thread-item ${active ? 'active' : ''} ${t.unread ? 'unread' : ''}`}>
      <Avatar first={t.customer?.firstName ?? t.title} last={t.customer?.lastName ?? ''} size="sm" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="row between" style={{ gap: 8 }}>
          <span className="thread-title truncate">{t.title}</span>
          <span className="tiny faint nowrap">{t.lastMessage ? relativeTime(t.lastMessage.createdAt) : ''}</span>
        </div>
        <div className="tiny muted truncate">{t.subtitle}</div>
        {t.lastMessage && (
          <div className="thread-preview truncate">
            {t.lastMessage.via === 'sms' && <Smartphone size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 3 }} />}
            {t.lastMessage.authorName}: {t.lastMessage.body}
          </div>
        )}
      </div>
      {t.unread > 0 && <span className="count-pill">{t.unread}</span>}
    </Link>
  );
}

const QUICK_REPLIES = ['Got it — thank you!', 'On my way now.', 'Running about 10 minutes late.', 'Delivered — it is on the shelf.', 'Can you send the order screenshot?'];

export function Conversation({ threadId, compact, showBack }: { threadId: number; compact?: boolean; showBack?: boolean }) {
  const { data, isLoading } = useThread(threadId);
  const { staff } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [data?.messages.length]);
  useEffect(() => {
    // Opening a thread marks it read on the server; refresh the list badge.
    if (data) qc.invalidateQueries({ queryKey: ['threads'] });
  }, [data?.thread.id, data?.messages.length, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (text = body) => {
    if (!text.trim() && !file) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('body', text.trim());
      if (file) form.append('file', file);
      await api(`/threads/${threadId}/messages`, { form });
      setBody('');
      setFile(null);
      await qc.invalidateQueries({ queryKey: ['thread', threadId] });
      qc.invalidateQueries({ queryKey: ['threads'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="stack" style={{ padding: 20 }}>
        <Skeleton h={24} w="40%" />
        <Skeleton h={60} />
      </div>
    );
  }
  const { thread, messages } = data;

  return (
    <>
      {!compact && (
        <div className="conv-header">
          {showBack && (
            <Link to="/app/inbox" className="btn btn-ghost btn-icon btn-sm" aria-label="Back to conversations">
              <ArrowLeft />
            </Link>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="strong truncate">{thread.title}</div>
            <div className="small muted truncate">{thread.subtitle}</div>
          </div>
          {thread.orderId && (
            <Link to={`/app/orders/${thread.orderId}`} className="btn btn-sm">
              Order <ExternalLink size={14} />
            </Link>
          )}
          {staff && thread.customer?.phone && (
            <a href={`tel:${thread.customer.phone}`} className="btn btn-sm btn-icon" title={formatPhone(thread.customer.phone)} aria-label="Call">
              <Phone />
            </a>
          )}
        </div>
      )}
      <div className="messages" ref={scroller}>
        {!messages.length && (
          <div className="empty small">
            {staff ? 'No messages yet.' : 'Send a message — it goes straight to the delivery team. You can also reply to any delivery text.'}
          </div>
        )}
        {groupMessages(messages).map((g, i) => (
          <Fragment key={i}>
            {g.day && <div className="tiny faint" style={{ textAlign: 'center', margin: '10px 0 2px' }}>{g.day}</div>}
            <div className={`msg-group ${g.mine ? 'mine' : ''}`}>
              {!g.mine && <div className="msg-author">{g.author}</div>}
              {g.items.map((m) => (
                <div key={m.id} className="bubble">
                  {m.body}
                  {m.attachment &&
                    (m.attachment.mime.startsWith('image/') ? (
                      <a href={m.attachment.url} target="_blank" rel="noreferrer">
                        <img src={m.attachment.url} alt={m.attachment.name} />
                      </a>
                    ) : (
                      <a href={m.attachment.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', display: 'block' }}>
                        {m.attachment.name}
                      </a>
                    ))}
                </div>
              ))}
              <div className="msg-time">
                {new Date(g.items[g.items.length - 1].createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {g.via === 'sms' && (
                  <>
                    · <Smartphone /> via text
                  </>
                )}
                {g.via === 'email' && (
                  <>
                    · <Mail /> via email
                  </>
                )}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      {staff && (
        <div className="quick-replies">
          {QUICK_REPLIES.map((r) => (
            <button key={r} className="chip" onClick={() => setBody(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
      <form
        className="composer"
        style={staff ? { borderTop: 0 } : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Button iconOnly variant="ghost" aria-label="Attach a photo" onClick={() => fileInput.current?.click()}>
          <Paperclip />
        </Button>
        <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {file && (
            <div className="small muted row" style={{ marginBottom: 4, gap: 6 }}>
              <Paperclip size={13} /> {file.name}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
                Remove
              </button>
            </div>
          )}
          <textarea
            className="textarea"
            rows={1}
            value={body}
            placeholder="Write a message…"
            aria-label="Message"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </div>
        <Button type="submit" variant="primary" iconOnly aria-label="Send" loading={sending} disabled={!body.trim() && !file}>
          <Send />
        </Button>
      </form>
    </>
  );
}

interface Group {
  author: string;
  mine: boolean;
  via: string;
  day: string | null;
  items: MessageDTO[];
}

function groupMessages(messages: MessageDTO[]): Group[] {
  const groups: Group[] = [];
  let lastDay = '';
  for (const m of messages) {
    const day = new Date(m.createdAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const author = m.author ? `${m.author.firstName} ${m.author.lastName}` : 'System';
    const prev = groups[groups.length - 1];
    const sameBlock =
      prev &&
      prev.author === author &&
      prev.via === m.via &&
      day === lastDay &&
      new Date(m.createdAt).getTime() - new Date(prev.items[prev.items.length - 1].createdAt).getTime() < 5 * 60_000;
    if (sameBlock) prev.items.push(m);
    else groups.push({ author, mine: m.mine, via: m.via, day: day !== lastDay ? day : null, items: [m] });
    lastDay = day;
  }
  return groups;
}

function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['people-search', q],
    queryFn: () => get<UserDTO[]>(`/staff/people${qs({ q })}`),
    enabled: open,
  });
  const start = async (userId: number) => {
    try {
      const t = await post<ThreadDTO>('/threads/direct', { userId });
      onClose();
      navigate(`/app/inbox/${t.id}`);
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="New message">
      <div className="stack">
        <Field label="To">
          {(id) => <input id={id} className="input" placeholder="Search families and cadets" value={q} onChange={(e) => setQ(e.target.value)} />}
        </Field>
        <div className="list card flat" style={{ maxHeight: 320, overflow: 'auto' }}>
          {data?.slice(0, 40).map((p) => (
            <button key={p.id} className="item" onClick={() => start(p.id)}>
              <Avatar first={p.firstName} last={p.lastName} size="sm" />
              <span style={{ flex: 1 }}>
                <span className="strong">
                  {p.firstName} {p.lastName}
                </span>
                <span className="small muted" style={{ display: 'block' }}>
                  {p.role === 'cadet' ? 'Cadet' : 'Family'} · {formatPhone(p.phone)}
                </span>
              </span>
            </button>
          ))}
          {data && !data.length && <div className="empty small">No matches.</div>}
        </div>
      </div>
    </Modal>
  );
}

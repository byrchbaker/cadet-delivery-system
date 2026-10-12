import type { MessageDTO, ThreadDTO } from '@cds/shared';
import { db } from '../db';
import { notify } from '../notify';
import { publish } from '../realtime';
import { can, staff } from './auth';
import { forbidden, notFound } from './http';
import { attachmentDTO, getOrder, relation, type OrderRow } from './orders';
import { fullName, getUser, linkedParents, staffWith, toPerson, type AuthUser, type UserRow } from './users';

export interface ThreadRow {
  id: number;
  kind: 'order' | 'direct';
  order_id: number | null;
  user_id: number | null;
  last_message_at: string | null;
  created_at: string;
}

export function getThread(id: number): ThreadRow | undefined {
  return db().prepare('SELECT * FROM threads WHERE id = ?').get(id) as ThreadRow | undefined;
}

export function directThreadFor(userId: number): ThreadRow {
  const existing = db().prepare("SELECT * FROM threads WHERE kind = 'direct' AND user_id = ?").get(userId) as ThreadRow | undefined;
  if (existing) return existing;
  const info = db().prepare("INSERT INTO threads (kind, user_id) VALUES ('direct', ?)").run(userId);
  return getThread(Number(info.lastInsertRowid))!;
}

export function canAccessThread(t: ThreadRow, user: AuthUser): boolean {
  if (t.kind === 'direct') return t.user_id === user.id || can(user, 'inbox');
  const o = t.order_id ? getOrder(t.order_id) : undefined;
  if (!o) return false;
  if (can(user, 'inbox')) return true;
  const rel = relation(o, user);
  if (staff(user)) return rel.manage || o.assigned_to === user.id;
  return rel.visible && !rel.redacted;
}

export function mustAccessThread(id: number, user: AuthUser): ThreadRow {
  const t = getThread(id);
  if (!t) throw notFound('Conversation not found.');
  if (!canAccessThread(t, user)) throw forbidden();
  return t;
}

/** People who should hear about new messages in a thread. */
export function threadParticipants(t: ThreadRow): UserRow[] {
  const out = new Map<number, UserRow>();
  const add = (u: UserRow | undefined) => u && u.status !== 'suspended' && out.set(u.id, u);
  staffWith('inbox').forEach(add);
  if (t.kind === 'direct') {
    add(getUser(t.user_id));
  } else if (t.order_id) {
    const o = getOrder(t.order_id)!;
    add(getUser(o.created_by));
    add(getUser(o.payer_id));
    add(getUser(o.assigned_to));
    const cadetSees = o.surprise === 'none' || o.status === 'delivered' || o.created_by === o.cadet_id;
    if (cadetSees) add(getUser(o.cadet_id));
  }
  return [...out.values()];
}

function threadTitle(t: ThreadRow, viewer: AuthUser): { title: string; subtitle: string; customer: UserRow | undefined; order?: OrderRow } {
  if (t.kind === 'direct') {
    const u = getUser(t.user_id);
    if (staff(viewer)) {
      const role = u?.role === 'cadet' ? 'Cadet' : u?.role === 'helper' ? 'Helper' : 'Family';
      return { title: fullName(u) || 'Unknown', subtitle: role, customer: u };
    }
    return { title: 'Direct messages', subtitle: 'With the delivery team', customer: u };
  }
  const o = getOrder(t.order_id!);
  const cadet = getUser(o?.cadet_id);
  return {
    title: o ? `#${o.ref} · ${o.service_name}` : 'Order',
    subtitle: cadet ? `For ${fullName(cadet)}` : '',
    customer: getUser(o?.created_by),
    order: o,
  };
}

export function listThreads(user: AuthUser): ThreadDTO[] {
  let rows: ThreadRow[];
  if (can(user, 'inbox')) {
    rows = db().prepare('SELECT * FROM threads WHERE last_message_at IS NOT NULL ORDER BY last_message_at DESC LIMIT 300').all() as ThreadRow[];
  } else if (staff(user)) {
    rows = db()
      .prepare(
        `SELECT t.* FROM threads t JOIN orders o ON o.id = t.order_id
         WHERE t.kind = 'order' AND (o.assigned_to = ? ${can(user, 'dispatch') ? 'OR 1=1' : ''}) AND t.last_message_at IS NOT NULL
         ORDER BY t.last_message_at DESC LIMIT 300`,
      )
      .all(user.id) as ThreadRow[];
    rows.push(directThreadFor(user.id));
  } else {
    const candidates = db()
      .prepare(
        `SELECT t.* FROM threads t LEFT JOIN orders o ON o.id = t.order_id
         WHERE (t.kind = 'direct' AND t.user_id = @uid)
            OR (t.kind = 'order' AND t.last_message_at IS NOT NULL AND (
                 o.created_by = @uid OR o.payer_id = @uid OR o.cadet_id = @uid
                 OR o.cadet_id IN (SELECT cadet_id FROM family_links WHERE parent_id = @uid)))
         ORDER BY t.last_message_at DESC`,
      )
      .all({ uid: user.id }) as ThreadRow[];
    rows = candidates.filter((t) => canAccessThread(t, user));
    if (!rows.some((t) => t.kind === 'direct')) rows.unshift(directThreadFor(user.id));
  }
  return rows.map((t) => threadDTO(t, user));
}

export function threadDTO(t: ThreadRow, viewer: AuthUser): ThreadDTO {
  const meta = threadTitle(t, viewer);
  const last = db()
    .prepare('SELECT m.body, m.via, m.created_at, m.author_id FROM messages m WHERE m.thread_id = ? ORDER BY m.id DESC LIMIT 1')
    .get(t.id) as { body: string; via: string; created_at: string; author_id: number | null } | undefined;
  const read = db().prepare('SELECT last_read_id FROM thread_reads WHERE thread_id = ? AND user_id = ?').get(t.id, viewer.id) as
    | { last_read_id: number }
    | undefined;
  const unread = (
    db()
      .prepare('SELECT COUNT(*) n FROM messages WHERE thread_id = ? AND id > ? AND (author_id IS NULL OR author_id != ?)')
      .get(t.id, read?.last_read_id ?? 0, viewer.id) as { n: number }
  ).n;
  const author = last ? getUser(last.author_id) : undefined;
  return {
    id: t.id,
    kind: t.kind,
    title: meta.title,
    subtitle: meta.subtitle,
    orderId: t.order_id,
    orderRef: meta.order?.ref ?? null,
    customer: toPerson(meta.customer, { contact: staff(viewer) }),
    lastMessage: last
      ? { body: last.body.slice(0, 160), authorName: author ? (author.id === viewer.id ? 'You' : author.first_name) : 'System', createdAt: last.created_at, via: last.via }
      : null,
    unread,
    updatedAt: t.last_message_at ?? t.created_at,
  };
}

interface MessageRow {
  id: number;
  thread_id: number;
  author_id: number | null;
  body: string;
  via: MessageDTO['via'];
  attachment_id: number | null;
  created_at: string;
}

export function listMessages(t: ThreadRow, viewer: AuthUser): MessageDTO[] {
  const rows = db().prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT 300').all(t.id) as MessageRow[];
  return rows.reverse().map((m) => messageDTO(m, viewer));
}

function messageDTO(m: MessageRow, viewer: AuthUser): MessageDTO {
  const author = getUser(m.author_id);
  const att = m.attachment_id
    ? (db().prepare('SELECT id, kind, name, mime, created_at FROM attachments WHERE id = ?').get(m.attachment_id) as
        | { id: number; kind: string; name: string; mime: string; created_at: string }
        | undefined)
    : undefined;
  return {
    id: m.id,
    threadId: m.thread_id,
    author: toPerson(author),
    body: m.body,
    via: m.via,
    attachment: att ? attachmentDTO(att) : null,
    createdAt: m.created_at,
    mine: m.author_id === viewer.id,
  };
}

export function markRead(threadId: number, userId: number): void {
  const last = db().prepare('SELECT MAX(id) id FROM messages WHERE thread_id = ?').get(threadId) as { id: number | null };
  db()
    .prepare(
      `INSERT INTO thread_reads (thread_id, user_id, last_read_id) VALUES (?, ?, ?)
       ON CONFLICT(thread_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
    )
    .run(threadId, userId, last.id ?? 0);
}

export function postMessage(
  t: ThreadRow,
  author: UserRow | null,
  body: string,
  via: MessageDTO['via'] = 'app',
  attachmentId: number | null = null,
): number {
  const now = new Date().toISOString();
  const info = db()
    .prepare('INSERT INTO messages (thread_id, author_id, body, via, attachment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(t.id, author?.id ?? null, body, via, attachmentId, now);
  db().prepare('UPDATE threads SET last_message_at = ? WHERE id = ?').run(now, t.id);
  if (author) markRead(t.id, author.id);
  const participants = threadParticipants(t);
  const ids = participants.map((p) => p.id);
  if (author && !ids.includes(author.id)) ids.push(author.id);
  publish(ids, { type: 'message', threadId: t.id });

  if (author) {
    const authorIsStaff = author.role === 'organizer' || author.role === 'helper';
    // Customers' messages go to the team; team replies go to customers (and the assigned driver).
    const recipients = participants.filter((p) => {
      if (p.id === author.id) return false;
      const pStaff = p.role === 'organizer' || p.role === 'helper';
      return authorIsStaff ? !pStaff || (t.order_id && getOrder(t.order_id)?.assigned_to === p.id) : true;
    });
    const preview = body.length > 280 ? `${body.slice(0, 277)}…` : body;
    notify({
      event: 'message',
      to: recipients,
      skipIfOnline: true,
      orderId: t.order_id ?? undefined,
      vars: { name: author.first_name, message: preview },
      link: `/app/inbox/${t.id}`,
    });
  }
  return Number(info.lastInsertRowid);
}

/**
 * Route an inbound text (e.g. a reply to a delivery update) into the right
 * conversation: the sender's most recent open order, otherwise their direct thread.
 */
export function routeInboundSms(fromE164: string, body: string): { threadId: number } | null {
  const user = db().prepare("SELECT * FROM users WHERE phone_e164 = ? AND status != 'suspended' ORDER BY id DESC LIMIT 1").get(fromE164) as
    | UserRow
    | undefined;
  if (!user) return null;
  const recent = db()
    .prepare(
      `SELECT t.* FROM threads t JOIN orders o ON o.id = t.order_id
       WHERE t.kind = 'order' AND o.status NOT IN ('declined','cancelled')
         AND (o.created_by = @uid OR o.payer_id = @uid OR (o.cadet_id = @uid AND (o.surprise = 'none' OR o.status = 'delivered')))
         AND o.updated_at >= @since
       ORDER BY o.updated_at DESC LIMIT 1`,
    )
    .get({ uid: user.id, since: new Date(Date.now() - 36 * 3600_000).toISOString() }) as ThreadRow | undefined;
  const thread = recent ?? directThreadFor(user.id);
  postMessage(thread, user, body, 'sms');
  return { threadId: thread.id };
}

export function familyOf(cadetId: number): UserRow[] {
  return linkedParents(cadetId);
}

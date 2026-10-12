import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { db } from '../db';
import { can, me, requireActive } from '../lib/auth';
import { badRequest, forbidden, intParam, notFound, parse } from '../lib/http';
import { getOrder, relation } from '../lib/orders';
import {
  canAccessThread,
  directThreadFor,
  getThread,
  listMessages,
  listThreads,
  markRead,
  mustAccessThread,
  postMessage,
  threadDTO,
} from '../lib/threads';
import { attachmentPath, saveAttachment, upload } from '../lib/uploads';
import { getUser } from '../lib/users';
import { publish } from '../realtime';

export const messageRoutes = Router();
messageRoutes.use(['/threads', '/files'], requireActive);

messageRoutes.get('/threads', (req, res) => {
  res.json(listThreads(me(req)));
});

/** Open (or create) a direct conversation. Customers get theirs; inbox staff can open one with anyone. */
messageRoutes.post('/threads/direct', (req, res) => {
  const user = me(req);
  const { userId } = parse(z.object({ userId: z.number().int().positive().optional() }), req.body ?? {});
  let target = user.id;
  if (userId && userId !== user.id) {
    if (!can(user, 'inbox')) throw forbidden();
    if (!getUser(userId)) throw notFound();
    target = userId;
  }
  res.json(threadDTO(directThreadFor(target), user));
});

messageRoutes.get('/threads/:id', (req, res) => {
  const user = me(req);
  const t = mustAccessThread(intParam(req), user);
  const messages = listMessages(t, user);
  markRead(t.id, user.id);
  publish([user.id], { type: 'message', threadId: t.id });
  res.json({ thread: threadDTO(t, user), messages });
});

messageRoutes.post('/threads/:id/messages', upload.single('file'), (req, res) => {
  const user = me(req);
  const t = mustAccessThread(intParam(req), user);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 4000) : '';
  if (!body && !req.file) throw badRequest('Write a message first.');
  const attachmentId = req.file ? saveAttachment(req.file, { threadId: t.id, kind: 'message', uploadedBy: user.id }) : null;
  const id = postMessage(t, user, body || 'Sent an attachment', 'app', attachmentId);
  res.status(201).json({ id });
});

messageRoutes.post('/threads/:id/read', (req, res) => {
  const user = me(req);
  const t = mustAccessThread(intParam(req), user);
  markRead(t.id, user.id);
  res.json({ ok: true });
});

/** Authenticated file download — access follows the order or conversation it belongs to. */
messageRoutes.get('/files/:id', (req, res) => {
  const user = me(req);
  const a = db().prepare('SELECT * FROM attachments WHERE id = ?').get(intParam(req)) as
    | { id: number; order_id: number | null; thread_id: number | null; kind: string; name: string; mime: string; path: string }
    | undefined;
  if (!a) throw notFound();
  let allowed = false;
  if (a.thread_id) {
    const t = getThread(a.thread_id);
    allowed = !!t && canAccessThread(t, user);
  } else if (a.order_id) {
    const o = getOrder(a.order_id);
    if (o) {
      const rel = relation(o, user);
      allowed = rel.visible && (!rel.redacted || a.kind === 'delivery');
    }
  }
  if (!allowed && !can(user, 'dispatch')) throw notFound();
  const p = attachmentPath(a.path);
  if (!fs.existsSync(p)) throw notFound('File is missing.');
  res.set('Cache-Control', 'private, max-age=86400');
  res.type(a.mime);
  if (req.query.download === '1') res.attachment(a.name);
  res.sendFile(p);
});

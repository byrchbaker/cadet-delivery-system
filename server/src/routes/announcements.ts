import { Router } from 'express';
import { announcementSchema, type AnnouncementDTO } from '@cds/shared';
import { db } from '../db';
import { me, requireActive, requirePerm, staff } from '../lib/auth';
import { intParam, notFound, parse } from '../lib/http';
import { getUser, toPerson, type UserRow } from '../lib/users';
import { notify } from '../notify';
import { broadcast } from '../realtime';

export const announcementRoutes = Router();

interface Row {
  id: number;
  title: string;
  body: string;
  audience: string;
  class_year: string | null;
  pinned: number;
  author_id: number | null;
  sms_count: number;
  email_count: number;
  created_at: string;
}

function dto(r: Row, includeDelivery: boolean): AnnouncementDTO {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    audience: r.audience,
    classYear: r.class_year,
    pinned: !!r.pinned,
    author: toPerson(getUser(r.author_id)),
    createdAt: r.created_at,
    delivery: includeDelivery ? { sms: r.sms_count, email: r.email_count } : undefined,
  };
}

function audienceFilter(user: UserRow): string {
  if (user.role === 'organizer' || user.role === 'helper') return '1=1';
  const role = user.role === 'parent' ? 'parents' : 'cadets';
  return `audience IN ('everyone', '${role}')`;
}

announcementRoutes.get('/announcements', requireActive, (req, res) => {
  const user = me(req);
  const rows = db()
    .prepare(`SELECT * FROM announcements WHERE ${audienceFilter(user)} ORDER BY pinned DESC, id DESC LIMIT 50`)
    .all() as Row[];
  let classYear: string | null = null;
  if (user.role === 'cadet') {
    classYear = (db().prepare('SELECT class_year FROM cadet_profiles WHERE user_id = ?').get(user.id) as { class_year: string } | undefined)?.class_year ?? null;
  }
  const visible = rows.filter((r) => !r.class_year || staff(user) || user.role === 'parent' || r.class_year === classYear);
  res.json(visible.map((r) => dto(r, staff(user))));
});

function recipientsFor(audience: string, classYear?: string): UserRow[] {
  const roles = audience === 'parents' ? ['parent'] : audience === 'cadets' ? ['cadet'] : audience === 'helpers' ? ['helper'] : ['parent', 'cadet', 'helper'];
  let rows = db()
    .prepare(`SELECT * FROM users WHERE status = 'active' AND role IN (${roles.map(() => '?').join(',')})`)
    .all(...roles) as UserRow[];
  if (classYear) {
    const ids = new Set(
      (db().prepare('SELECT user_id FROM cadet_profiles WHERE class_year = ?').all(classYear) as { user_id: number }[]).map((r) => r.user_id),
    );
    const parentIds = new Set(
      (db().prepare(`SELECT parent_id FROM family_links WHERE cadet_id IN (${[...ids].join(',') || '0'})`).all() as { parent_id: number }[]).map(
        (r) => r.parent_id,
      ),
    );
    rows = rows.filter((r) => ids.has(r.id) || parentIds.has(r.id) || r.role === 'helper');
  }
  return rows;
}

announcementRoutes.post('/announcements', requirePerm('announce'), (req, res) => {
  const user = me(req);
  const a = parse(announcementSchema, req.body);
  const info = db()
    .prepare('INSERT INTO announcements (title, body, audience, class_year, pinned, author_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(a.title, a.body, a.audience, a.classYear || null, a.pinned ? 1 : 0, user.id);
  const id = Number(info.lastInsertRowid);
  const result = notify({
    event: 'announcement',
    to: recipientsFor(a.audience, a.classYear || undefined),
    exclude: user.id,
    vars: { title: a.title, message: a.body },
    link: '/app/news',
    channels: { sms: a.sendSms, email: a.sendEmail },
  });
  db().prepare('UPDATE announcements SET sms_count = ?, email_count = ? WHERE id = ?').run(result.sms, result.email, id);
  broadcast({ type: 'announcement' });
  res.status(201).json(dto(db().prepare('SELECT * FROM announcements WHERE id = ?').get(id) as Row, true));
});

announcementRoutes.patch('/announcements/:id', requirePerm('announce'), (req, res) => {
  const id = intParam(req);
  const a = parse(announcementSchema.partial(), req.body);
  const row = db().prepare('SELECT * FROM announcements WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw notFound();
  db()
    .prepare('UPDATE announcements SET title = ?, body = ?, pinned = ? WHERE id = ?')
    .run(a.title ?? row.title, a.body ?? row.body, a.pinned === undefined ? row.pinned : a.pinned ? 1 : 0, id);
  broadcast({ type: 'announcement' });
  res.json({ ok: true });
});

announcementRoutes.delete('/announcements/:id', requirePerm('announce'), (req, res) => {
  db().prepare('DELETE FROM announcements WHERE id = ?').run(intParam(req));
  broadcast({ type: 'announcement' });
  res.json({ ok: true });
});

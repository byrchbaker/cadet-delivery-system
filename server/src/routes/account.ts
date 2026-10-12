import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  DEFAULT_HELPER_PERMISSIONS,
  loginSchema,
  managedCadetSchema,
  passwordSchema,
  profileUpdateSchema,
  registerSchema,
  toE164,
  type HelperPermission,
} from '@cds/shared';
import { config } from '../config';
import { db, json, tx } from '../db';
import {
  createSession,
  destroyAllSessions,
  destroySession,
  hashPassword,
  me,
  requireActive,
  requireAuth,
  verifyPassword,
} from '../lib/auth';
import { badRequest, conflict, forbidden, HttpError, intParam, notFound, parse } from '../lib/http';
import { sha256, shortCode, token } from '../lib/ids';
import { getSettings, siteUrl } from '../lib/settings';
import {
  fullName,
  getUser,
  isLinked,
  link,
  linkedCadets,
  linkedParents,
  organizers,
  toUserDTO,
  upsertCadetProfile,
  type UserRow,
} from '../lib/users';
import { notify, sendSystemEmail } from '../notify';
import { publish } from '../realtime';

export const accountRoutes = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.isTest ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

interface InviteRow {
  code: string;
  kind: 'family' | 'helper';
  created_by: number;
  for_user_id: number | null;
  permissions: string | null;
  expires_at: string;
  used_by: number | null;
  used_at: string | null;
}

function findInvite(code: string | undefined): InviteRow | undefined {
  if (!code) return undefined;
  const row = db()
    .prepare("SELECT * FROM invites WHERE code = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .get(code.trim().toUpperCase()) as InviteRow | undefined;
  if (!row) return undefined;
  if (row.kind === 'helper' && row.used_at) return undefined;
  if (row.for_user_id && row.used_at) return undefined;
  return row;
}

function emailTaken(email: string, exceptId?: number): boolean {
  const row = db().prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  return !!row && row.id !== exceptId;
}

// Look up an invite before registering so the sign-up page can adapt.
accountRoutes.get('/invites/:code', (req, res) => {
  const inv = findInvite(String(req.params.code));
  if (!inv) throw notFound('This invite link is invalid or has expired.');
  const from = getUser(inv.created_by);
  const forUser = getUser(inv.for_user_id);
  const role = inv.kind === 'helper' ? 'helper' : from?.role === 'cadet' ? 'parent' : 'cadet';
  res.json({
    kind: inv.kind,
    role,
    fromName: fullName(from),
    prefill: forUser ? { firstName: forUser.first_name, lastName: forUser.last_name, phone: forUser.phone } : null,
  });
});

accountRoutes.post('/auth/register', authLimiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const invite = findInvite(input.invite);
  if (input.invite && !invite) throw badRequest('This invite link is invalid or has expired.');
  const reg = getSettings('registration');
  if (input.role === 'helper') {
    if (!invite && !reg.helperApplications) throw forbidden('Helper applications are closed right now.');
    if (invite && invite.kind !== 'helper') throw badRequest('This invite is for family members, not helpers.');
  } else {
    if (!invite && !reg.openSignup) throw forbidden('Sign-up is by invitation only. Ask your family member or the organizer for a link.');
    if (invite?.kind === 'helper') throw badRequest('This invite is for helpers. Choose “Helper” to continue.');
    if (invite?.kind === 'family') {
      const from = getUser(invite.created_by);
      const expected = from?.role === 'cadet' ? 'parent' : 'cadet';
      if (input.role !== expected) throw badRequest(`This invite is for a ${expected === 'cadet' ? 'cadet' : 'parent or family member'}.`);
    }
  }
  if (emailTaken(input.email, invite?.for_user_id ?? undefined)) throw badRequest('An account with that email already exists. Try signing in.', { email: 'Already registered' });

  const hash = await hashPassword(input.password);
  const user = tx(() => {
    let id: number;
    const claim = invite?.kind === 'family' && invite.for_user_id ? getUser(invite.for_user_id) : undefined;
    if (claim && !claim.password_hash) {
      // A family member set up this cadet earlier — the cadet now claims the profile.
      db()
        .prepare('UPDATE users SET email = ?, password_hash = ?, first_name = ?, last_name = ?, phone = ?, phone_e164 = ?, managed_by = NULL WHERE id = ?')
        .run(input.email, hash, input.firstName, input.lastName, input.phone, toE164(input.phone), claim.id);
      id = claim.id;
    } else {
      const status = input.role === 'helper' && !invite ? 'pending' : 'active';
      const perms: HelperPermission[] = input.role === 'helper' ? (invite ? json(invite.permissions, DEFAULT_HELPER_PERMISSIONS) : []) : [];
      const info = db()
        .prepare(
          `INSERT INTO users (role, status, email, password_hash, first_name, last_name, phone, phone_e164, permissions, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(input.role, status, input.email, hash, input.firstName, input.lastName, input.phone, toE164(input.phone), JSON.stringify(perms), input.note ?? null);
      id = Number(info.lastInsertRowid);
    }
    if (input.role === 'cadet') upsertCadetProfile(id, input.cadet ?? {});
    if (invite?.kind === 'family') {
      const from = getUser(invite.created_by)!;
      if (from.role === 'parent') link(from.id, id);
      else link(id, from.id);
      if (invite.for_user_id) db().prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?').run(id, new Date().toISOString(), invite.code);
    }
    if (invite?.kind === 'helper') db().prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?').run(id, new Date().toISOString(), invite.code);
    return getUser(id)!;
  });

  if (user.role === 'helper' && user.status === 'pending') {
    notify({
      event: 'helper_application',
      to: organizers(),
      vars: { name: fullName(user), message: input.note ?? '' },
      link: '/app/team',
    });
    publish(organizers().map((o) => o.id), { type: 'team' });
  }
  if (invite?.kind === 'family') publish([invite.created_by], { type: 'team' });

  createSession(res, user.id, req.get('user-agent'));
  res.status(201).json({ user: toUserDTO(user) });
});

accountRoutes.post('/auth/login', authLimiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = db().prepare('SELECT * FROM users WHERE email = ?').get(input.email) as UserRow | undefined;
  const ok = await verifyPassword(input.password, user?.password_hash ?? null);
  if (!user || !ok) throw new HttpError(401, 'That email and password do not match.');
  if (user.status === 'suspended') throw forbidden('This account has been deactivated. Contact the organizer.');
  createSession(res, user.id, req.get('user-agent'));
  res.json({ user: toUserDTO(user) });
});

accountRoutes.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

accountRoutes.get('/auth/me', (req, res) => {
  res.json({ user: req.user ? toUserDTO(req.user) : null });
});

accountRoutes.post('/auth/forgot', authLimiter, (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
  const user = db().prepare("SELECT * FROM users WHERE email = ? AND status != 'suspended'").get(email) as UserRow | undefined;
  if (user) {
    // Also lets people the organizer added by hand set a password and claim their account.
    const link = createResetLink(user.id);
    sendSystemEmail(
      user.id,
      email,
      user.password_hash ? 'Reset your password' : 'Set up your account',
      `Hi ${user.first_name},\n\nUse this link to choose ${user.password_hash ? 'a new' : 'your'} password. It expires in 2 hours.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    );
  }
  res.json({ ok: true });
});

export function createResetLink(userId: number, hours = 2): string {
  const raw = token(24);
  db()
    .prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(raw), userId, new Date(Date.now() + hours * 3600_000).toISOString());
  return `${siteUrl()}/reset?token=${raw}`;
}

accountRoutes.post('/auth/reset', authLimiter, async (req, res) => {
  const input = parse(z.object({ token: z.string().min(10), password: passwordSchema }), req.body);
  const row = db()
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .get(sha256(input.token)) as { token_hash: string; user_id: number } | undefined;
  if (!row) throw badRequest('This reset link is invalid or has expired. Request a new one.');
  const hash = await hashPassword(input.password);
  db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
  db().prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(new Date().toISOString(), row.token_hash);
  destroyAllSessions(row.user_id);
  createSession(res, row.user_id, req.get('user-agent'));
  res.json({ user: toUserDTO(getUser(row.user_id)!) });
});

// ---------------------------------------------------------------------------
// Profile

accountRoutes.patch('/me', requireAuth, (req, res) => {
  const user = me(req);
  const input = parse(profileUpdateSchema, req.body);
  if (input.email && emailTaken(input.email, user.id)) throw badRequest('That email is used by another account.', { email: 'Already in use' });
  const next = {
    first_name: input.firstName ?? user.first_name,
    last_name: input.lastName ?? user.last_name,
    email: input.email ?? user.email,
    phone: input.phone ?? user.phone,
    notify_sms: input.notifySms === undefined ? user.notify_sms : input.notifySms ? 1 : 0,
    notify_email: input.notifyEmail === undefined ? user.notify_email : input.notifyEmail ? 1 : 0,
    theme: input.theme ?? user.theme,
  };
  db()
    .prepare(
      `UPDATE users SET first_name = @first_name, last_name = @last_name, email = @email, phone = @phone, phone_e164 = @e164,
       notify_sms = @notify_sms, notify_email = @notify_email, theme = @theme WHERE id = @id`,
    )
    .run({ ...next, e164: toE164(next.phone), id: user.id });
  if (user.role === 'cadet' && input.cadet) upsertCadetProfile(user.id, input.cadet);
  res.json({ user: toUserDTO(getUser(user.id)!) });
});

accountRoutes.post('/me/password', requireAuth, async (req, res) => {
  const user = me(req);
  const input = parse(z.object({ current: z.string(), next: passwordSchema }), req.body);
  if (!(await verifyPassword(input.current, user.password_hash))) throw badRequest('Your current password is incorrect.', { current: 'Incorrect' });
  db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(input.next), user.id);
  destroyAllSessions(user.id, req.sessionId);
  res.json({ ok: true });
});

accountRoutes.get('/me/notifications', requireAuth, (req, res) => {
  const rows = db()
    .prepare("SELECT id, event, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? AND channel = 'inapp' ORDER BY id DESC LIMIT 60")
    .all(me(req).id) as { id: number; event: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }[];
  res.json(rows.map((r) => ({ id: r.id, event: r.event, title: r.title, body: r.body, link: r.link, readAt: r.read_at, createdAt: r.created_at })));
});

accountRoutes.post('/me/notifications/read', requireAuth, (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).optional() }), req.body ?? {});
  const now = new Date().toISOString();
  if (ids?.length) {
    const stmt = db().prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND channel = 'inapp' AND read_at IS NULL");
    tx(() => ids.forEach((id) => stmt.run(now, id, me(req).id)));
  } else {
    db().prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND channel = 'inapp' AND read_at IS NULL").run(now, me(req).id);
  }
  publish([me(req).id], { type: 'notification' });
  res.json({ ok: true });
});

/** Badge counts for the navigation. */
accountRoutes.get('/me/badges', requireActive, (req, res) => {
  const user = me(req);
  const notifications = (
    db().prepare("SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND channel = 'inapp' AND read_at IS NULL").get(user.id) as { n: number }
  ).n;
  res.json({ notifications });
});

// ---------------------------------------------------------------------------
// Family links

accountRoutes.get('/family', requireActive, (req, res) => {
  const user = me(req);
  if (user.role === 'parent') {
    const cadets = linkedCadets(user.id);
    const parents = new Map<number, UserRow>();
    for (const c of cadets) for (const p of linkedParents(c.id)) if (p.id !== user.id) parents.set(p.id, p);
    res.json({ cadets: cadets.map((c) => toUserDTO(c)), parents: [...parents.values()].map((p) => toUserDTO(p)) });
  } else if (user.role === 'cadet') {
    res.json({ cadets: [toUserDTO(user)], parents: linkedParents(user.id).map((p) => toUserDTO(p)) });
  } else {
    res.json({ cadets: [], parents: [] });
  }
});

accountRoutes.post('/family/invite', requireActive, (req, res) => {
  const user = me(req);
  if (user.role !== 'parent' && user.role !== 'cadet') throw forbidden();
  const { forCadetId } = parse(z.object({ forCadetId: z.number().int().positive().optional() }), req.body ?? {});
  if (forCadetId) {
    const c = getUser(forCadetId);
    if (user.role !== 'parent' || !c || !isLinked(user.id, c.id)) throw forbidden();
    if (c.password_hash) throw conflict(`${c.first_name} already has an account.`);
  }
  const code = shortCode(8);
  db()
    .prepare("INSERT INTO invites (code, kind, created_by, for_user_id, expires_at) VALUES (?, 'family', ?, ?, ?)")
    .run(code, user.id, forCadetId ?? null, new Date(Date.now() + 21 * 86400_000).toISOString());
  res.status(201).json({ code, url: `${siteUrl()}/join/${code}` });
});

accountRoutes.post('/family/redeem', requireActive, (req, res) => {
  const user = me(req);
  const { code } = parse(z.object({ code: z.string().trim().min(4).max(20) }), req.body);
  const inv = findInvite(code);
  if (!inv || inv.kind !== 'family') throw badRequest('That code is invalid or has expired.', { code: 'Invalid code' });
  const from = getUser(inv.created_by);
  if (!from) throw badRequest('That code is no longer valid.');
  if (from.id === user.id) throw badRequest("That's your own code — send it to your family member.");
  if (inv.for_user_id) throw badRequest('This invite is for a cadet who has not created an account yet. Open the link to sign up.');
  if (from.role === 'parent' && user.role === 'cadet') link(from.id, user.id);
  else if (from.role === 'cadet' && user.role === 'parent') link(user.id, from.id);
  else throw badRequest(user.role === 'parent' ? 'Family codes link a parent to a cadet. Ask your cadet for their code.' : 'Ask a parent or family member for their code.');
  publish([from.id, user.id], { type: 'team' });
  res.json({ ok: true, linked: toUserDTO(from) });
});

accountRoutes.post('/family/cadets', requireActive, (req, res) => {
  const user = me(req);
  if (user.role !== 'parent') throw forbidden('Only family accounts can add a cadet.');
  const input = parse(managedCadetSchema, req.body);
  if (input.email && emailTaken(input.email)) {
    throw badRequest('That cadet already has an account. Ask them for their family code to link up.', { email: 'Already registered' });
  }
  const id = tx(() => {
    const info = db()
      .prepare(
        `INSERT INTO users (role, status, email, first_name, last_name, phone, phone_e164, managed_by)
         VALUES ('cadet', 'active', ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.email || null, input.firstName, input.lastName, input.phone, toE164(input.phone), user.id);
    const newId = Number(info.lastInsertRowid);
    upsertCadetProfile(newId, { classYear: input.classYear, squadron: input.squadron, dorm: input.dorm });
    link(user.id, newId);
    return newId;
  });
  res.status(201).json({ cadet: toUserDTO(getUser(id)!) });
});

accountRoutes.patch('/family/cadets/:id', requireActive, (req, res) => {
  const user = me(req);
  const id = intParam(req);
  const cadet = getUser(id);
  if (!cadet || cadet.role !== 'cadet' || !isLinked(user.id, id)) throw notFound();
  if (cadet.password_hash) throw forbidden(`${cadet.first_name} manages their own profile.`);
  const input = parse(managedCadetSchema, req.body);
  if (input.email && emailTaken(input.email, id)) throw badRequest('That email is used by another account.', { email: 'Already in use' });
  db()
    .prepare('UPDATE users SET first_name = ?, last_name = ?, phone = ?, phone_e164 = ?, email = ? WHERE id = ?')
    .run(input.firstName, input.lastName, input.phone, toE164(input.phone), input.email || null, id);
  upsertCadetProfile(id, { classYear: input.classYear, squadron: input.squadron, dorm: input.dorm });
  res.json({ cadet: toUserDTO(getUser(id)!) });
});

accountRoutes.delete('/family/links/:id', requireActive, (req, res) => {
  const user = me(req);
  const other = intParam(req);
  if (user.role === 'parent') db().prepare('DELETE FROM family_links WHERE parent_id = ? AND cadet_id = ?').run(user.id, other);
  else if (user.role === 'cadet') db().prepare('DELETE FROM family_links WHERE parent_id = ? AND cadet_id = ?').run(other, user.id);
  else throw forbidden();
  res.json({ ok: true });
});


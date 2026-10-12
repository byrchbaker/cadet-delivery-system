import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import * as cookie from 'cookie';
import { hasPermission, isStaff, type HelperPermission } from '@cds/shared';
import { config } from '../config';
import { db } from '../db';
import { sha256, token } from './ids';
import { forbidden, HttpError } from './http';
import { asAuth, type AuthUser, type UserRow } from './users';

export const SESSION_COOKIE = 'cds_sid';
const SESSION_DAYS = 45;

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    sessionId?: string;
  }
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, config.isTest ? 4 : 11);
}

export async function verifyPassword(pw: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pw, hash);
}

export function createSession(res: Response, userId: number, userAgent?: string): void {
  const raw = token(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db()
    .prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)')
    .run(sha256(raw), userId, expires.toISOString(), (userAgent ?? '').slice(0, 200));
  res.cookie(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd && config.appUrl.startsWith('https'),
    expires,
    path: '/',
  });
}

export function destroySession(req: Request, res: Response): void {
  if (req.sessionId) db().prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function destroyAllSessions(userId: number, exceptId?: string): void {
  if (exceptId) db().prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptId);
  else db().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

let lastSeenWrites = new Map<number, number>();

/** Attach req.user when a valid session cookie is present. */
export function loadUser(req: Request, _res: Response, next: NextFunction): void {
  const raw = cookie.parse(req.headers.cookie ?? '')[SESSION_COOKIE];
  if (raw) {
    const id = sha256(raw);
    const row = db()
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .get(id) as UserRow | undefined;
    if (row && row.status !== 'suspended') {
      req.user = asAuth(row);
      req.sessionId = id;
      const now = Date.now();
      if ((lastSeenWrites.get(row.id) ?? 0) < now - 60_000) {
        lastSeenWrites.set(row.id, now);
        if (lastSeenWrites.size > 5000) lastSeenWrites = new Map();
        db().prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), row.id);
      }
    }
  }
  next();
}

/** Basic CSRF defence: state-changing API calls must carry a custom header. */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/webhooks/')) return next();
  if (req.get('x-requested-with') !== 'cds') return next(new HttpError(403, 'Missing request header.'));
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  next();
}

/** Signed in and approved (pending helpers are held at the door). */
export function requireActive(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (req.user.status !== 'active') return next(forbidden('Your account is waiting for approval.'));
  next();
}

export function requireStaff(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (!isStaff(req.user)) return next(forbidden());
  next();
}

export function requireOrganizer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new HttpError(401, 'Please sign in.'));
  if (req.user.role !== 'organizer') return next(forbidden('Only the organizer can do that.'));
  next();
}

export function requirePerm(perm: HelperPermission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.'));
    if (!can(req.user, perm)) return next(forbidden());
    next();
  };
}

/** Any one of several permissions is enough. */
export function requireAnyPerm(...perms: HelperPermission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new HttpError(401, 'Please sign in.'));
    if (!perms.some((p) => can(req.user, p))) return next(forbidden());
    next();
  };
}

export function can(user: AuthUser | undefined, perm: HelperPermission): boolean {
  if (!user) return false;
  return hasPermission({ role: user.role, status: user.status, permissions: user.perms }, perm);
}

export function staff(user: AuthUser | undefined): boolean {
  return !!user && isStaff(user);
}

export function me(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  return req.user;
}

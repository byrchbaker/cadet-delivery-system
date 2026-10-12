import type { AccountStatus, CadetProfile, HelperPermission, Person, Role, UserDTO } from '@cds/shared';
import { HELPER_PERMISSION_KEYS } from '@cds/shared';
import { db, json } from '../db';

export interface UserRow {
  id: number;
  role: Role;
  status: AccountStatus;
  email: string | null;
  password_hash: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone_e164: string | null;
  notify_sms: number;
  notify_email: number;
  permissions: string;
  theme: string | null;
  managed_by: number | null;
  note: string | null;
  staff_notes: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface AuthUser extends UserRow {
  perms: HelperPermission[];
}

export function permsOf(row: Pick<UserRow, 'permissions'>): HelperPermission[] {
  return json<string[]>(row.permissions, []).filter((p): p is HelperPermission => (HELPER_PERMISSION_KEYS as string[]).includes(p));
}

export function asAuth(row: UserRow): AuthUser {
  return { ...row, perms: permsOf(row) };
}

export function getUser(id: number | null | undefined): UserRow | undefined {
  if (!id) return undefined;
  return db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getCadetProfile(userId: number): CadetProfile | null {
  const row = db().prepare('SELECT class_year, squadron, dorm FROM cadet_profiles WHERE user_id = ?').get(userId) as
    | { class_year: string; squadron: string; dorm: string }
    | undefined;
  return row ? { classYear: row.class_year, squadron: row.squadron, dorm: row.dorm } : null;
}

export function upsertCadetProfile(userId: number, p: Partial<CadetProfile>): void {
  const current = getCadetProfile(userId) ?? { classYear: '', squadron: '', dorm: '' };
  const next = { ...current, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) };
  db()
    .prepare(
      `INSERT INTO cadet_profiles (user_id, class_year, squadron, dorm) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET class_year = excluded.class_year, squadron = excluded.squadron, dorm = excluded.dorm`,
    )
    .run(userId, next.classYear, next.squadron, next.dorm);
}

export function toUserDTO(row: UserRow, opts: { includeStaffNotes?: boolean } = {}): UserDTO {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    notifySms: !!row.notify_sms,
    notifyEmail: !!row.notify_email,
    permissions: permsOf(row),
    theme: row.theme,
    managed: !row.password_hash,
    cadet: row.role === 'cadet' ? getCadetProfile(row.id) : null,
    note: opts.includeStaffNotes ? row.staff_notes : undefined,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function toPerson(row: UserRow | undefined | null, opts: { contact?: boolean } = {}): Person | null {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    ...(opts.contact ? { phone: row.phone, email: row.email } : {}),
  };
}

export function fullName(row: Pick<UserRow, 'first_name' | 'last_name'> | undefined | null): string {
  return row ? `${row.first_name} ${row.last_name}`.trim() : '';
}

export function linkedParents(cadetId: number): UserRow[] {
  return db()
    .prepare('SELECT u.* FROM users u JOIN family_links f ON f.parent_id = u.id WHERE f.cadet_id = ? ORDER BY u.first_name')
    .all(cadetId) as UserRow[];
}

export function linkedCadets(parentId: number): UserRow[] {
  return db()
    .prepare('SELECT u.* FROM users u JOIN family_links f ON f.cadet_id = u.id WHERE f.parent_id = ? ORDER BY u.first_name')
    .all(parentId) as UserRow[];
}

export function isLinked(parentId: number, cadetId: number): boolean {
  return !!db().prepare('SELECT 1 FROM family_links WHERE parent_id = ? AND cadet_id = ?').get(parentId, cadetId);
}

export function link(parentId: number, cadetId: number): void {
  db().prepare('INSERT OR IGNORE INTO family_links (parent_id, cadet_id) VALUES (?, ?)').run(parentId, cadetId);
}

/** Active organizers plus active helpers holding a given permission. */
export function staffWith(perm: HelperPermission | null): UserRow[] {
  const rows = db()
    .prepare("SELECT * FROM users WHERE (role = 'organizer' OR role = 'helper') AND status = 'active'")
    .all() as UserRow[];
  return rows.filter((r) => r.role === 'organizer' || (perm !== null && permsOf(r).includes(perm)));
}

export function organizers(): UserRow[] {
  return db().prepare("SELECT * FROM users WHERE role = 'organizer' AND status = 'active' ORDER BY id").all() as UserRow[];
}

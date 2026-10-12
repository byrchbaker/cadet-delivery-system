import { renderTemplate, resolveTemplate, type TemplateKey } from '@cds/shared';
import { config } from '../config';
import { db } from '../db';
import { publish, isOnline } from '../realtime';
import { getSettings, getTemplateOverrides, siteUrl } from '../lib/settings';
import type { UserRow } from '../lib/users';
import { getDrivers } from './providers';

export type Vars = Record<string, string | number | null | undefined>;

export interface NotifyOptions {
  event: TemplateKey;
  to: (UserRow | undefined | null)[];
  vars: Vars | ((user: UserRow) => Vars);
  /** Path ('/app/orders/1') or absolute URL; may differ per recipient. */
  link?: string | ((user: UserRow) => string);
  orderId?: number;
  /** Skip text/email for people currently in the app (chat messages). */
  skipIfOnline?: boolean;
  /** Override the template's channel switches (announcements). */
  channels?: { sms?: boolean; email?: boolean };
  /** Exclude this user (usually whoever triggered the event). */
  exclude?: number;
}

export interface NotifyResult {
  inapp: number;
  sms: number;
  email: number;
}

const absolute = (link: string) => (/^https?:\/\//.test(link) ? link : `${siteUrl()}${link}`);

export function notify(opts: NotifyOptions): NotifyResult {
  const result: NotifyResult = { inapp: 0, sms: 0, email: 0 };
  const tpl = resolveTemplate(opts.event, getTemplateOverrides()[opts.event]);
  const profile = getSettings('profile');
  const seen = new Set<number>();
  const insert = db().prepare(
    `INSERT INTO notifications (user_id, channel, event, to_address, title, body, link, order_id, status)
     VALUES (@user_id, @channel, @event, @to_address, @title, @body, @link, @order_id, @status)`,
  );

  for (const user of opts.to) {
    if (!user || seen.has(user.id) || user.id === opts.exclude || user.status === 'suspended') continue;
    seen.add(user.id);
    const linkPath = typeof opts.link === 'function' ? opts.link(user) : opts.link;
    const link = linkPath ? absolute(linkPath) : siteUrl();
    const vars: Vars = {
      business: profile.businessName,
      organizer: profile.ownerName,
      ...(typeof opts.vars === 'function' ? opts.vars(user) : opts.vars),
      link,
    };
    const title = renderTemplate(tpl.subject, vars);
    const smsBody = renderTemplate(tpl.sms, vars);
    const emailBody = renderTemplate(tpl.email, vars);
    const base = { user_id: user.id, event: opts.event, link: linkPath ?? null, order_id: opts.orderId ?? null };

    insert.run({ ...base, channel: 'inapp', to_address: null, title, body: smsBody, status: 'sent' });
    result.inapp++;

    if (opts.skipIfOnline && isOnline(user.id)) continue;
    const wantSms = opts.channels?.sms ?? tpl.channels.sms;
    const wantEmail = opts.channels?.email ?? tpl.channels.email;
    if (wantSms && user.notify_sms && user.phone_e164) {
      insert.run({ ...base, channel: 'sms', to_address: user.phone_e164, title, body: smsBody, status: 'pending' });
      result.sms++;
    }
    if (wantEmail && user.notify_email && user.email) {
      insert.run({ ...base, channel: 'email', to_address: user.email, title, body: emailBody, status: 'pending' });
      result.email++;
    }
  }

  if (seen.size) publish(seen, { type: 'notification' });
  if (result.sms || result.email) scheduleQueue();
  return result;
}

// ---------------------------------------------------------------------------
// Outbound queue

let running = false;
let again = false;
let pendingTimer: NodeJS.Timeout | null = null;

export function scheduleQueue(): void {
  if (pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void processQueue();
  }, 10);
}

interface QueueRow {
  id: number;
  channel: 'sms' | 'email';
  to_address: string;
  title: string;
  body: string;
  link: string | null;
  attempts: number;
}

export async function processQueue(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      const rows = db()
        .prepare(
          `SELECT id, channel, to_address, title, body, link, attempts FROM notifications
           WHERE status = 'pending' AND channel IN ('sms','email') AND attempts < 3 ORDER BY id LIMIT 25`,
        )
        .all() as QueueRow[];
      for (const row of rows) await deliver(row);
      if (rows.length === 25) again = true;
    } while (again);
  } finally {
    running = false;
  }
}

async function deliver(row: QueueRow): Promise<void> {
  const drivers = getDrivers();
  const result =
    row.channel === 'sms'
      ? await drivers.sms(row.to_address, row.body)
      : await drivers.email(row.to_address, row.title, row.body + emailFooter(), emailHtml(row.title, row.body));
  const attempts = row.attempts + 1;
  if (result.ok) {
    db().prepare("UPDATE notifications SET status = 'sent', sent_at = ?, attempts = ?, error = NULL WHERE id = ?").run(new Date().toISOString(), attempts, row.id);
  } else if (result.skipped) {
    db().prepare("UPDATE notifications SET status = 'skipped', attempts = ?, error = ? WHERE id = ?").run(attempts, result.error ?? null, row.id);
    if (!config.isProd && !config.isTest) {
      console.log(`[${row.channel} not configured] → ${row.to_address}: ${row.channel === 'sms' ? row.body : row.title}`);
    }
  } else {
    db()
      .prepare('UPDATE notifications SET status = ?, attempts = ?, error = ? WHERE id = ?')
      .run(attempts >= 3 ? 'failed' : 'pending', attempts, result.error ?? 'Unknown error', row.id);
  }
}

export function retryNotification(id: number): boolean {
  const r = db()
    .prepare("UPDATE notifications SET status = 'pending', attempts = 0, error = NULL WHERE id = ? AND channel IN ('sms','email') AND status IN ('failed','skipped')")
    .run(id);
  if (r.changes) scheduleQueue();
  return r.changes > 0;
}

function emailFooter(): string {
  return `\n\n—\nManage notification preferences: ${siteUrl()}/app/profile`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function emailHtml(title: string, body: string): string {
  const profile = getSettings('profile');
  const html = escapeHtml(body)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d4f91">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#eef1f5;font-family:Helvetica,Arial,sans-serif;color:#14213d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:6px;overflow:hidden;border:1px solid #d6dbe3">
<tr><td style="background:#0b1f44;color:#ffffff;padding:16px 24px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:bold">${escapeHtml(profile.businessName)}</td></tr>
<tr><td style="height:3px;background:#a7b1bf"></td></tr>
<tr><td style="padding:24px 24px 8px"><h1 style="margin:0 0 16px;font-size:20px;color:#0b1f44">${escapeHtml(title)}</h1>${html}</td></tr>
<tr><td style="padding:12px 24px 20px;font-size:12px;color:#5b6577;border-top:1px solid #e3e7ee">
You're receiving this because you use ${escapeHtml(profile.businessName)}. <a href="${siteUrl()}/app/profile" style="color:#5b6577">Notification preferences</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** One-off system email (password resets, invites) that bypasses templates but still lands in the outbox. */
export function sendSystemEmail(userId: number | null, to: string, subject: string, body: string): void {
  db()
    .prepare("INSERT INTO notifications (user_id, channel, event, to_address, title, body, status) VALUES (?, 'email', 'system', ?, ?, ?, 'pending')")
    .run(userId, to, subject, body);
  scheduleQueue();
}

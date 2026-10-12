import fs from 'node:fs';
import path from 'node:path';
import { addDays, nowTimeIn, todayIn } from '@cds/shared';
import { config } from './config';
import { db } from './db';
import { customerRecipients, orderLink, orderVars, type OrderRow } from './lib/orders';
import { getSettings, timezone } from './lib/settings';
import { notify, processQueue } from './notify';

// Small in-process scheduler: no cron daemon to babysit.

export function sendReminders(now = new Date()): number {
  const tz = timezone();
  const sched = getSettings('scheduling');
  const hour = Number(nowTimeIn(tz, now).slice(0, 2));
  if (hour < sched.reminderHour) return 0;
  const tomorrow = addDays(todayIn(tz, now), 1);
  const rows = db()
    .prepare("SELECT * FROM orders WHERE service_date = ? AND status = 'confirmed' AND reminder_sent_at IS NULL")
    .all(tomorrow) as OrderRow[];
  for (const o of rows) {
    db().prepare('UPDATE orders SET reminder_sent_at = ? WHERE id = ?').run(now.toISOString(), o.id);
    notify({ event: 'reminder', to: customerRecipients(o), orderId: o.id, vars: (u) => orderVars(o, u), link: (u) => orderLink(o, u, 'app') });
  }
  return rows.length;
}

export async function createBackup(): Promise<string> {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const name = `cds-${stamp}.sqlite`;
  await db().backup(path.join(config.backupsDir, name));
  const files = fs
    .readdirSync(config.backupsDir)
    .filter((f) => f.startsWith('cds-') && f.endsWith('.sqlite'))
    .sort()
    .reverse();
  for (const old of files.slice(config.backupKeep)) fs.rmSync(path.join(config.backupsDir, old), { force: true });
  return name;
}

let lastBackupDay = '';

async function nightlyBackup(now = new Date()): Promise<void> {
  const tz = timezone();
  const day = todayIn(tz, now);
  if (day === lastBackupDay || Number(nowTimeIn(tz, now).slice(0, 2)) !== 3) return;
  lastBackupDay = day;
  try {
    await createBackup();
  } catch (err) {
    console.error('Backup failed', err);
  }
}

function cleanup(): void {
  const now = new Date().toISOString();
  db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db().prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now);
  // Keep a year of in-app notifications.
  db().prepare("DELETE FROM notifications WHERE channel = 'inapp' AND created_at < ?").run(new Date(Date.now() - 365 * 86400_000).toISOString());
}

let timer: NodeJS.Timeout | null = null;

export function startJobs(): void {
  if (timer) return;
  const tick = async () => {
    try {
      sendReminders();
      await processQueue();
      await nightlyBackup();
    } catch (err) {
      console.error('Scheduled job failed', err);
    }
  };
  cleanup();
  timer = setInterval(() => void tick(), 60_000);
  setInterval(cleanup, 6 * 3600_000).unref();
  void tick();
}

export function stopJobs(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

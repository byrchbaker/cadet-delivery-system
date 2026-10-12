import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';
import { getSettings } from '../lib/settings';

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface Drivers {
  email(to: string, subject: string, text: string, html: string): Promise<SendResult>;
  sms(to: string, body: string): Promise<SendResult>;
}

// ---------------------------------------------------------------------------
// Email (SMTP — works with Gmail/Google Workspace app passwords, Outlook, SES…)

let cachedTransport: { key: string; transport: Transporter } | null = null;

export function emailConfig() {
  if (config.smtp) return { ...config.smtp, source: 'environment' as const };
  const e = getSettings('providers').email;
  if (!e.enabled || !e.host) return null;
  return { host: e.host, port: e.port, secure: e.secure, user: e.user, pass: e.pass, from: e.from || e.user, source: 'settings' as const };
}

async function sendEmail(to: string, subject: string, text: string, html: string): Promise<SendResult> {
  const c = emailConfig();
  if (!c) return { ok: false, skipped: true, error: 'Email is not set up' };
  const key = JSON.stringify([c.host, c.port, c.secure, c.user, c.pass]);
  if (!cachedTransport || cachedTransport.key !== key) {
    cachedTransport = {
      key,
      transport: nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.pass } : undefined,
      }),
    };
  }
  const businessName = getSettings('profile').businessName;
  try {
    await cachedTransport.transport.sendMail({ from: `"${businessName.replace(/"/g, '')}" <${c.from}>`, to, subject, text, html });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 300) };
  }
}

// ---------------------------------------------------------------------------
// SMS (Twilio REST API — no SDK needed)

export function smsConfig() {
  if (config.twilio) return { ...config.twilio, source: 'environment' as const };
  const s = getSettings('providers').sms;
  if (!s.enabled || !s.accountSid || !s.authToken || (!s.fromNumber && !s.messagingServiceSid)) return null;
  return { accountSid: s.accountSid, authToken: s.authToken, fromNumber: s.fromNumber, messagingServiceSid: s.messagingServiceSid, source: 'settings' as const };
}

async function sendSms(to: string, body: string): Promise<SendResult> {
  const c = smsConfig();
  if (!c) return { ok: false, skipped: true, error: 'Text messaging is not set up' };
  const form = new URLSearchParams({ To: to, Body: body });
  if (c.messagingServiceSid) form.set('MessagingServiceSid', c.messagingServiceSid);
  else form.set('From', c.fromNumber);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: data.message ?? `Twilio error ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 300) };
  }
}

export const realDrivers: Drivers = { email: sendEmail, sms: sendSms };
let drivers: Drivers = realDrivers;

export function getDrivers(): Drivers {
  return drivers;
}

/** Tests swap in recording drivers. */
export function setDrivers(d: Drivers): void {
  drivers = d;
}

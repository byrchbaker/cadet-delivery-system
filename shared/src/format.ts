// Formatting helpers used for on-screen text and outgoing messages.

export function money(cents: number | null | undefined, opts: { always?: boolean } = {}): string {
  const c = cents ?? 0;
  const whole = c % 100 === 0 && !opts.always;
  return (c / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** '17:30' → '5:30 PM' */
export function time12(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** '17:30' → '1730' */
export function time24(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  return hhmm.replace(':', '');
}

export function timeBoth(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  return `${time12(hhmm)} (${time24(hhmm)})`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

/** Day-of-week for a calendar date, independent of time zone. */
export function weekday(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** '2026-10-14' → 'Wed, Oct 14' */
export function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const { m, d } = parseYmd(ymd);
  return `${WEEKDAYS[weekday(ymd)]}, ${MONTHS[m - 1]} ${d}`;
}

export function addDays(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Today's calendar date in a given IANA zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Current wall-clock time 'HH:MM' in a zone. */
export function nowTimeIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/** Offset (minutes) of a zone from UTC at a given instant. */
function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Convert a local date + time in a zone into a UTC Date. */
export function zonedToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const { y, m, d } = parseYmd(ymd);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = zoneOffsetMinutes(timeZone, guess);
  const result = new Date(guess.getTime() - offset * 60000);
  // Re-check across DST boundaries.
  const offset2 = zoneOffsetMinutes(timeZone, result);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000);
}

/** 'HH:MM' wall time of an instant in a zone. */
export function clockIn(iso: string | Date, timeZone: string): string {
  return nowTimeIn(timeZone, typeof iso === 'string' ? new Date(iso) : iso);
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const fmt = (n: number, unit: string) => {
    const v = Math.round(n);
    const label = `${v} ${unit}${v === 1 ? '' : 's'}`;
    return diff < 0 ? `${label} ago` : `in ${label}`;
  };
  if (abs < 45) return diff < 0 ? 'just now' : 'in a moment';
  if (abs < 3600) return fmt(abs / 60, 'min');
  if (abs < 86400) return fmt(abs / 3600, 'hr');
  if (abs < 86400 * 7) return fmt(abs / 86400, 'day');
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function initials(first?: string | null, last?: string | null): string {
  return `${(first ?? '').charAt(0)}${(last ?? '').charAt(0)}`.toUpperCase() || '?';
}

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Normalise a US phone number to E.164 (+15551234567). */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '');
    return digits.length >= 10 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

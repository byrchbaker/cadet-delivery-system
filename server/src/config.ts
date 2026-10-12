import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Both src/config.ts (dev) and dist/index.js (prod) sit two levels below the repo root.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

// Pick up a .env file at the repo root when running outside Docker.
const envFile = path.join(repoRoot, '.env');
if (!process.env.VITEST && fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

const dataDir = path.resolve(env.DATA_DIR ?? path.join(repoRoot, 'data'));

export const config = {
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? '0.0.0.0',
  dataDir,
  dbPath: env.DATABASE_PATH ?? path.join(dataDir, 'cds.sqlite'),
  uploadsDir: path.join(dataDir, 'uploads'),
  backupsDir: path.join(dataDir, 'backups'),
  backupKeep: Number(env.BACKUP_KEEP ?? 14),
  /** Public URL used in links inside texts and emails, e.g. https://delivery.example.com */
  appUrl: (env.APP_URL ?? '').replace(/\/$/, ''),
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test' || !!env.VITEST,
  trustProxy: env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal',
  webDist: env.WEB_DIST ?? path.join(repoRoot, 'web', 'dist'),
  /** Optional provider configuration via environment (overrides the settings screen). */
  smtp: env.SMTP_HOST
    ? {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? 587),
        secure: env.SMTP_SECURE === 'true',
        user: env.SMTP_USER ?? '',
        pass: env.SMTP_PASS ?? '',
        from: env.SMTP_FROM ?? env.SMTP_USER ?? '',
      }
    : null,
  twilio: env.TWILIO_ACCOUNT_SID
    ? {
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN ?? '',
        fromNumber: env.TWILIO_FROM_NUMBER ?? '',
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID ?? '',
      }
    : null,
};

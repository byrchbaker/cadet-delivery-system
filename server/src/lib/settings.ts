import { SETTINGS_SCHEMAS, type SettingsSection, type TemplateKey, type TemplateOverride, TEMPLATE_KEYS } from '@cds/shared';
import type { z } from 'zod';
import { config } from '../config';
import { db, json } from '../db';

type SectionValue<K extends SettingsSection> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

const cache = new Map<string, unknown>();

export function getSettings<K extends SettingsSection>(section: K): SectionValue<K> {
  if (cache.has(section)) return cache.get(section) as SectionValue<K>;
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(section) as { value: string } | undefined;
  const parsed = SETTINGS_SCHEMAS[section].safeParse(json(row?.value, {}));
  const value = (parsed.success ? parsed.data : SETTINGS_SCHEMAS[section].parse({})) as SectionValue<K>;
  cache.set(section, value);
  return value;
}

export function saveSettings<K extends SettingsSection>(section: K, value: unknown): SectionValue<K> {
  const parsed = SETTINGS_SCHEMAS[section].parse(value) as SectionValue<K>;
  db()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(section, JSON.stringify(parsed));
  cache.set(section, parsed);
  return parsed;
}

export function getTemplateOverrides(): Partial<Record<TemplateKey, TemplateOverride>> {
  if (cache.has('templates')) return cache.get('templates') as Partial<Record<TemplateKey, TemplateOverride>>;
  const row = db().prepare("SELECT value FROM settings WHERE key = 'templates'").get() as { value: string } | undefined;
  const raw = json<Record<string, TemplateOverride>>(row?.value, {});
  const clean: Partial<Record<TemplateKey, TemplateOverride>> = {};
  for (const k of TEMPLATE_KEYS) if (raw[k]) clean[k] = raw[k];
  cache.set('templates', clean);
  return clean;
}

export function saveTemplateOverrides(value: Partial<Record<TemplateKey, TemplateOverride>>): void {
  db()
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('templates', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    )
    .run(JSON.stringify(value));
  cache.set('templates', value);
}

export function clearSettingsCache(): void {
  cache.clear();
}

export function timezone(): string {
  return getSettings('scheduling').timezone || 'America/Denver';
}

/** Absolute base URL for links in outgoing messages. */
export function siteUrl(): string {
  return (getSettings('profile').siteUrl || config.appUrl || `http://localhost:${config.port}`).replace(/\/$/, '');
}

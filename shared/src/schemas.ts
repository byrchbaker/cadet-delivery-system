import { z } from 'zod';
import { HELPER_PERMISSION_KEYS, type HelperPermission } from './domain';
import { CATEGORY_KEYS } from './domain';

const trimmed = (max = 200) => z.string().trim().max(max);
const requiredText = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max);

export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine((v) => v === '' || v.replace(/\D/g, '').length >= 10, 'Enter a 10-digit phone number');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email').max(200);
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(200);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time');

export const cadetProfileSchema = z.object({
  classYear: trimmed(20).default(''),
  squadron: trimmed(40).default(''),
  dorm: trimmed(80).default(''),
});

export const registerSchema = z.object({
  role: z.enum(['parent', 'cadet', 'helper']),
  firstName: requiredText('First name', 60),
  lastName: requiredText('Last name', 60),
  email: emailSchema,
  phone: phoneSchema.refine((v) => v !== '', 'Phone is required for delivery updates'),
  password: passwordSchema,
  invite: trimmed(40).optional(),
  cadet: cadetProfileSchema.optional(),
  note: trimmed(1000).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export const setupSchema = z.object({
  businessName: requiredText('Business name', 80),
  firstName: requiredText('First name', 60),
  lastName: requiredText('Last name', 60),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  starter: z.object({
    services: z.boolean().default(false),
    locations: z.boolean().default(false),
    lists: z.boolean().default(false),
  }),
});
export type SetupInput = z.infer<typeof setupSchema>;

export const profileUpdateSchema = z.object({
  firstName: requiredText('First name', 60).optional(),
  lastName: requiredText('Last name', 60).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  notifySms: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  theme: z.string().max(20).optional(),
  cadet: cadetProfileSchema.partial().optional(),
});

export const managedCadetSchema = z.object({
  firstName: requiredText('First name', 60),
  lastName: requiredText('Last name', 60),
  phone: phoneSchema.refine((v) => v !== '', 'Cadet phone is required for delivery texts'),
  email: z.union([emailSchema, z.literal('')]).optional(),
  classYear: trimmed(20).default(''),
  squadron: trimmed(40).default(''),
  dorm: trimmed(80).default(''),
});

export const orderInputSchema = z.object({
  serviceId: z.number().int().positive(),
  runId: z.number().int().positive().nullable().optional(),
  cadetId: z.number().int().positive(),
  serviceDate: dateSchema,
  time: timeSchema,
  locationId: z.number().int().positive().nullable().optional(),
  details: z.record(z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])).default({}),
  notes: trimmed(2000).default(''),
  surprise: z.enum(['none', 'heads_up', 'hidden']).default('none'),
  askCadet: z.boolean().default(false),
  payer: z.enum(['me', 'family']).default('me'),
  payerId: z.number().int().positive().nullable().optional(),
  tipCents: z.number().int().min(0).max(100_000).default(0),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const orderStaffUpdateSchema = z.object({
  serviceDate: dateSchema.optional(),
  time: timeSchema.optional(),
  locationId: z.number().int().positive().nullable().optional(),
  details: z.record(z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])).optional(),
  notes: trimmed(2000).optional(),
  staffNotes: trimmed(2000).optional(),
  feeCents: z.number().int().min(0).max(1_000_000).optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
  runId: z.number().int().positive().nullable().optional(),
});

export const serviceSchema = z.object({
  name: requiredText('Name', 100),
  category: z.enum(CATEGORY_KEYS),
  description: trimmed(500).default(''),
  instructions: trimmed(2000).default(''),
  feeCents: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});

export const locationSchema = z.object({
  name: requiredText('Name', 100),
  details: trimmed(500).default(''),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});

export const runSchema = z.object({
  title: requiredText('Title', 100),
  serviceId: z.number().int().positive(),
  vendor: trimmed(120).default(''),
  runDate: dateSchema,
  pickupTime: timeSchema,
  cutoffAt: z.string().max(40).nullable().optional(),
  locationId: z.number().int().positive().nullable().optional(),
  capacity: z.number().int().min(0).max(500).default(0),
  feeCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  notes: trimmed(2000).default(''),
  status: z.enum(['open', 'closed', 'done', 'cancelled']).default('open'),
});

export const permissionsSchema = z
  .array(z.string())
  .transform((arr) => arr.filter((p): p is HelperPermission => (HELPER_PERMISSION_KEYS as string[]).includes(p)));

export const announcementSchema = z.object({
  title: requiredText('Title', 140),
  body: requiredText('Message', 5000),
  audience: z.enum(['everyone', 'parents', 'cadets', 'helpers']).default('everyone'),
  classYear: trimmed(20).optional(),
  pinned: z.boolean().default(false),
  sendSms: z.boolean().default(false),
  sendEmail: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Settings (stored as JSON documents, edited from the organizer console)

export const profileSettingsSchema = z.object({
  businessName: trimmed(80).default('Cadet Delivery Service'),
  tagline: trimmed(160).default(''),
  ownerName: trimmed(80).default(''),
  phone: trimmed(32).default(''),
  email: trimmed(200).default(''),
  packageAddress: trimmed(400).default(''),
  serviceArea: trimmed(400).default(''),
  hours: trimmed(200).default(''),
  about: trimmed(4000).default(''),
  facebookUrl: trimmed(300).default(''),
  siteUrl: trimmed(300).default(''),
});
export type ProfileSettings = z.infer<typeof profileSettingsSchema>;

export const schedulingSettingsSchema = z.object({
  timezone: trimmed(60).default('America/Denver'),
  minLeadHours: z.number().min(0).max(24 * 30).default(24),
  allowShortNotice: z.boolean().default(true),
  windowStart: timeSchema.default('17:00'),
  windowEnd: timeSchema.default('20:00'),
  maxPerDay: z.number().int().min(0).max(500).default(0),
  reminderHour: z.number().int().min(0).max(23).default(18),
  blackouts: z.array(z.object({ date: dateSchema, reason: trimmed(200).default('') })).default([]),
  defaultLocationId: z.number().int().nullable().default(null),
});
export type SchedulingSettings = z.infer<typeof schedulingSettingsSchema>;

export const paymentMethodSchema = z.object({
  id: z.string().min(1).max(40),
  label: requiredText('Label', 40),
  url: trimmed(500).default(''),
  details: trimmed(500).default(''),
  enabled: z.boolean().default(true),
});
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentSettingsSchema = z.object({
  methods: z.array(paymentMethodSchema).default([]),
  allowTips: z.boolean().default(true),
  instructions: trimmed(1000).default(''),
});
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export const listsSettingsSchema = z.object({
  classYears: z.array(trimmed(20)).default([]),
  squadrons: z.array(trimmed(40)).default([]),
  dorms: z.array(trimmed(80)).default([]),
});
export type ListsSettings = z.infer<typeof listsSettingsSchema>;

export const appearanceSettingsSchema = z.object({
  theme: z.enum(['academy', 'falcon', 'neutral']).default('academy'),
  allowUserTheme: z.boolean().default(true),
});
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;

export const registrationSettingsSchema = z.object({
  openSignup: z.boolean().default(true),
  helperApplications: z.boolean().default(true),
});
export type RegistrationSettings = z.infer<typeof registrationSettingsSchema>;

export const providerSettingsSchema = z.object({
  email: z
    .object({
      enabled: z.boolean().default(false),
      host: trimmed(200).default(''),
      port: z.number().int().min(1).max(65535).default(587),
      secure: z.boolean().default(false),
      user: trimmed(200).default(''),
      pass: z.string().max(500).default(''),
      from: trimmed(200).default(''),
    })
    .default({}),
  sms: z
    .object({
      enabled: z.boolean().default(false),
      accountSid: trimmed(100).default(''),
      authToken: z.string().max(200).default(''),
      fromNumber: trimmed(32).default(''),
      messagingServiceSid: trimmed(100).default(''),
    })
    .default({}),
});
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;

export const SETTINGS_SCHEMAS = {
  profile: profileSettingsSchema,
  scheduling: schedulingSettingsSchema,
  payments: paymentSettingsSchema,
  lists: listsSettingsSchema,
  appearance: appearanceSettingsSchema,
  registration: registrationSettingsSchema,
  providers: providerSettingsSchema,
} as const;
export type SettingsSection = keyof typeof SETTINGS_SCHEMAS;
export const PUBLIC_SETTINGS: SettingsSection[] = ['profile', 'scheduling', 'appearance', 'registration', 'lists'];

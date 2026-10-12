// Shapes returned by the API.
import type { AccountStatus, Category, HelperPermission, OrderStatus, PaymentStatus, Role, SurpriseMode } from './domain';

export interface CadetProfile {
  classYear: string;
  squadron: string;
  dorm: string;
}

export interface Person {
  id: number;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
}

export interface UserDTO extends Person {
  status: AccountStatus;
  email: string | null;
  phone: string | null;
  notifySms: boolean;
  notifyEmail: boolean;
  permissions: HelperPermission[];
  theme: string | null;
  managed: boolean;
  cadet: CadetProfile | null;
  note?: string | null;
  createdAt: string;
  lastSeenAt?: string | null;
}

export interface LocationDTO {
  id: number;
  name: string;
  details: string;
  active: boolean;
  sort: number;
}

export interface ServiceDTO {
  id: number;
  name: string;
  category: Category;
  description: string;
  instructions: string;
  feeCents: number;
  active: boolean;
  sort: number;
}

export interface RunDTO {
  id: number;
  title: string;
  serviceId: number;
  serviceName: string;
  vendor: string;
  runDate: string;
  pickupTime: string;
  cutoffAt: string | null;
  location: LocationDTO | null;
  capacity: number;
  feeCents: number;
  notes: string;
  status: 'open' | 'closed' | 'done' | 'cancelled';
  orderCount: number;
  isOpen: boolean;
}

export interface OrderEventDTO {
  id: number;
  type: string;
  status: OrderStatus | null;
  message: string;
  actor: Person | null;
  createdAt: string;
}

export interface AttachmentDTO {
  id: number;
  kind: 'receipt' | 'delivery' | 'message' | 'other';
  name: string;
  mime: string;
  url: string;
  createdAt: string;
}

export interface OrderDTO {
  id: number;
  ref: string;
  status: OrderStatus;
  category: Category;
  serviceId: number;
  serviceName: string;
  feeCents: number;
  tipCents: number;
  totalCents: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paymentRef: string | null;
  serviceDate: string;
  time: string;
  location: LocationDTO | null;
  details: Record<string, string | number | boolean | null>;
  summary: string;
  notes: string;
  staffNotes?: string;
  surprise: SurpriseMode;
  /** True when the viewer is the cadet and contents are hidden. */
  redacted: boolean;
  shortNotice: boolean;
  cadet: Person & { cadet?: CadetProfile | null };
  createdBy: Person;
  payer: Person | null;
  assignedTo: Person | null;
  run: { id: number; title: string } | null;
  etaAt: string | null;
  deliveredAt: string | null;
  deliveryNote: string | null;
  threadId: number | null;
  trackingToken?: string;
  attachments: AttachmentDTO[];
  events?: OrderEventDTO[];
  createdAt: string;
  updatedAt: string;
  can: {
    edit: boolean;
    cancel: boolean;
    pay: boolean;
    respond: boolean;
    manage: boolean;
    deliver: boolean;
    claim: boolean;
    verifyPayment: boolean;
  };
}

export interface ThreadDTO {
  id: number;
  kind: 'order' | 'direct';
  title: string;
  subtitle: string;
  orderId: number | null;
  orderRef: string | null;
  customer: Person | null;
  lastMessage: { body: string; authorName: string; createdAt: string; via: string } | null;
  unread: number;
  updatedAt: string;
}

export interface MessageDTO {
  id: number;
  threadId: number;
  author: Person | null;
  body: string;
  via: 'app' | 'sms' | 'email' | 'system';
  attachment: AttachmentDTO | null;
  createdAt: string;
  mine: boolean;
}

export interface NotificationDTO {
  id: number;
  event: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AnnouncementDTO {
  id: number;
  title: string;
  body: string;
  audience: string;
  classYear: string | null;
  pinned: boolean;
  author: Person | null;
  createdAt: string;
  delivery?: { sms: number; email: number };
}

export interface FamilyDTO {
  cadets: UserDTO[];
  parents: UserDTO[];
}

export interface PublicInfoDTO {
  needsSetup: boolean;
  profile: {
    businessName: string;
    tagline: string;
    ownerName: string;
    serviceArea: string;
    hours: string;
    about: string;
    facebookUrl: string;
  };
  appearance: { theme: string; allowUserTheme: boolean };
  registration: { openSignup: boolean; helperApplications: boolean };
  scheduling: { timezone: string; minLeadHours: number; windowStart: string; windowEnd: string };
  lists: { classYears: string[]; squadrons: string[]; dorms: string[] };
  services: ServiceDTO[];
  runs: RunDTO[];
}

export interface DashboardDTO {
  today: string;
  counts: {
    requested: number;
    proposed: number;
    today: number;
    inProgress: number;
    unpaid: number;
    paymentsToVerify: number;
    unreadThreads: number;
    pendingHelpers: number;
  };
  revenueWeekCents: number;
  revenueMonthCents: number;
}

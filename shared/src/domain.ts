// Core domain vocabulary shared by the API and the web client.

export const ROLES = ['organizer', 'helper', 'parent', 'cadet'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  organizer: 'Organizer',
  helper: 'Helper',
  parent: 'Parent / Family',
  cadet: 'Cadet',
};

export type AccountStatus = 'active' | 'pending' | 'suspended';

/**
 * What an approved helper may do. The organizer grants these per person from
 * Team settings. Organizers implicitly hold every permission plus admin.
 */
export const HELPER_PERMISSIONS = {
  deliver: {
    label: 'Run deliveries',
    description: 'Use Run Mode for orders assigned to them: post ETAs, mark picked up and delivered, upload proof photos.',
  },
  claim: {
    label: 'Claim open orders',
    description: 'See confirmed orders with no driver and assign them to themselves.',
  },
  dispatch: {
    label: 'Dispatch',
    description: 'See every order, accept or decline requests, edit orders and assign drivers.',
  },
  inbox: {
    label: 'Shared inbox',
    description: 'Read and answer every conversation. Without this they only see threads for their assigned orders.',
  },
  payments: {
    label: 'Payments',
    description: 'Confirm reported payments, mark orders paid or waived.',
  },
  announce: {
    label: 'Announcements',
    description: 'Post announcements and broadcasts to families.',
  },
  people: {
    label: 'Customer directory',
    description: 'View family and cadet contact details.',
  },
} as const;
export type HelperPermission = keyof typeof HELPER_PERMISSIONS;
export const HELPER_PERMISSION_KEYS = Object.keys(HELPER_PERMISSIONS) as HelperPermission[];
export const DEFAULT_HELPER_PERMISSIONS: HelperPermission[] = ['deliver', 'claim'];

export function hasPermission(
  user: { role: Role; status?: AccountStatus; permissions?: string[] | null } | null | undefined,
  perm: HelperPermission,
): boolean {
  if (!user) return false;
  if (user.role === 'organizer') return true;
  if (user.role !== 'helper' || user.status !== 'active') return false;
  return (user.permissions ?? []).includes(perm);
}

export function isStaff(user: { role: Role; status?: AccountStatus } | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'organizer' || (user.role === 'helper' && user.status === 'active');
}

// ---------------------------------------------------------------------------
// Order lifecycle

export const ORDER_STATUSES = [
  'proposed',
  'requested',
  'confirmed',
  'picking_up',
  'picked_up',
  'en_route',
  'delivered',
  'declined',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  proposed: 'Awaiting cadet',
  requested: 'Requested',
  confirmed: 'Confirmed',
  picking_up: 'Heading to pickup',
  picked_up: 'Picked up',
  en_route: 'On the way',
  delivered: 'Delivered',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export const ACTIVE_STATUSES: OrderStatus[] = ['requested', 'confirmed', 'picking_up', 'picked_up', 'en_route'];
export const IN_PROGRESS_STATUSES: OrderStatus[] = ['picking_up', 'picked_up', 'en_route'];
export const CLOSED_STATUSES: OrderStatus[] = ['delivered', 'declined', 'cancelled'];

/** Statuses a driver moves an order through, in order. */
export const DELIVERY_FLOW: OrderStatus[] = ['confirmed', 'picking_up', 'picked_up', 'en_route', 'delivered'];

/** The steps shown on the customer-facing tracker. */
export const TRACKER_STEPS: OrderStatus[] = ['requested', 'confirmed', 'picked_up', 'en_route', 'delivered'];

export function trackerIndex(status: OrderStatus): number {
  switch (status) {
    case 'proposed':
      return -1;
    case 'requested':
      return 0;
    case 'confirmed':
    case 'picking_up':
      return 1;
    case 'picked_up':
      return 2;
    case 'en_route':
      return 3;
    case 'delivered':
      return 4;
    default:
      return -1;
  }
}

export const PAYMENT_STATUSES = ['unpaid', 'reported', 'paid', 'covered', 'waived', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  reported: 'Payment sent — verifying',
  paid: 'Paid',
  covered: 'Covered by subscription',
  waived: 'Waived',
  refunded: 'Refunded',
};
export const SETTLED_PAYMENT: PaymentStatus[] = ['paid', 'covered', 'waived', 'refunded'];

export type SurpriseMode = 'none' | 'heads_up' | 'hidden';
export const SURPRISE_LABELS: Record<SurpriseMode, string> = {
  none: 'Not a surprise',
  heads_up: 'Tell my cadet when and where, but not what',
  hidden: 'Keep it completely secret until delivered',
};

// ---------------------------------------------------------------------------
// Service categories drive which questions the order wizard asks.

export type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'time' | 'number' | 'checkbox';

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  half?: boolean;
}

export const CATEGORY_KEYS = ['food', 'birthday', 'grocery', 'package', 'laundry', 'transport', 'other'] as const;
export type Category = (typeof CATEGORY_KEYS)[number];

export interface CategorySpec {
  label: string;
  plural: string;
  blurb: string;
  /** Label for the scheduled time on this kind of order. */
  timeLabel: string;
  timeHelp: string;
  /** Prepaid orders are paid to the store directly before pickup. */
  prepaid: boolean;
  fields: FieldSpec[];
  statusLabels?: Partial<Record<OrderStatus, string>>;
}

const orderNameField: FieldSpec = {
  key: 'orderName',
  label: 'Name on the order',
  type: 'text',
  placeholder: 'CADET SMITH',
  help: "Use your cadet's last name — not the sender's name — so the order is easy to match at pickup.",
  required: true,
  half: true,
};
const orderNumberField: FieldSpec = {
  key: 'orderNumber',
  label: 'Order / confirmation number',
  type: 'text',
  placeholder: '#A1B2C3',
  help: "Don't have it yet? Leave blank and attach or send the screenshot later.",
  half: true,
};

export const CATEGORIES: Record<Category, CategorySpec> = {
  food: {
    label: 'Food',
    plural: 'Food & restaurant',
    blurb: 'Restaurant orders picked up and brought to the delivery shelf.',
    timeLabel: 'Pickup time at the restaurant',
    timeHelp: 'The ready time you chose in the restaurant app.',
    prepaid: true,
    fields: [
      { key: 'vendor', label: 'Restaurant', type: 'text', placeholder: 'Chipotle — Interquest', required: true },
      orderNameField,
      orderNumberField,
      { key: 'items', label: "What's in the order", type: 'textarea', placeholder: '2 burrito bowls, chips & guac, 2 bottled drinks', help: 'Helps your cadet know what to look for.' },
    ],
  },
  birthday: {
    label: 'Birthday',
    plural: 'Birthdays & celebrations',
    blurb: 'Cakes, cupcakes, cookies and surprise celebrations.',
    timeLabel: 'Pickup time at the bakery',
    timeHelp: 'The ready time you chose with the bakery.',
    prepaid: true,
    fields: [
      { key: 'vendor', label: 'Bakery or store', type: 'text', placeholder: 'Nothing Bundt Cakes', required: true },
      orderNameField,
      orderNumberField,
      { key: 'items', label: 'What was ordered', type: 'textarea', placeholder: '1 dozen chocolate cupcakes, "Happy 20th, Sam!"' },
      { key: 'occasion', label: 'Note for the card', type: 'text', placeholder: 'Love you! — Mom & Dad' },
    ],
  },
  grocery: {
    label: 'Grocery',
    plural: 'Grocery & goods',
    blurb: 'Curbside grocery and store pickups — Walmart, King Soopers, Target and more.',
    timeLabel: 'Pickup window start',
    timeHelp: 'The pickup slot you booked with the store.',
    prepaid: true,
    fields: [
      { key: 'vendor', label: 'Store', type: 'text', placeholder: 'King Soopers — Monument', required: true },
      orderNameField,
      orderNumberField,
      { key: 'items', label: 'Order summary', type: 'textarea', placeholder: 'Snacks, toiletries, laundry detergent' },
      { key: 'bags', label: 'I requested bags with the order', type: 'checkbox', help: 'Most Colorado stores charge for bags — add them in the store app.' },
    ],
  },
  package: {
    label: 'Package',
    plural: 'Packages',
    blurb: 'Packages shipped to the organizer, then hand-delivered.',
    timeLabel: 'Preferred delivery time',
    timeHelp: 'When your cadet can meet. Delivery happens after the package arrives.',
    prepaid: false,
    fields: [
      {
        key: 'carrier',
        label: 'Carrier',
        type: 'select',
        half: true,
        options: [
          { value: 'usps', label: 'USPS' },
          { value: 'ups', label: 'UPS' },
          { value: 'fedex', label: 'FedEx' },
          { value: 'amazon', label: 'Amazon' },
          { value: 'other', label: 'Other' },
        ],
      },
      { key: 'tracking', label: 'Tracking number', type: 'text', half: true },
      { key: 'expectedDate', label: 'Expected arrival', type: 'date', half: true },
      { key: 'signature', label: 'Signature required', type: 'checkbox', half: true },
      { key: 'items', label: 'Contents', type: 'textarea', placeholder: 'Care package — 2 boxes' },
    ],
    statusLabels: { picked_up: 'Package in hand', picking_up: 'Package received' },
  },
  laundry: {
    label: 'Laundry',
    plural: 'Laundry & dry cleaning',
    blurb: 'Bag dropped at the delivery nook, cleaned, and returned.',
    timeLabel: 'Collection time',
    timeHelp: 'When the bag will be at the delivery nook.',
    prepaid: false,
    fields: [
      { key: 'bagLabel', label: 'Name on the bag', type: 'text', placeholder: 'C3C Jordan Smith', required: true, help: 'Bags must be labeled with first and last name.', half: true },
      { key: 'returnDate', label: 'Return by', type: 'date', half: true },
      { key: 'items', label: 'Instructions', type: 'textarea', placeholder: 'Blues shirts — light starch' },
    ],
    statusLabels: { picking_up: 'Collecting bag', picked_up: 'At the cleaners', en_route: 'Returning', delivered: 'Returned' },
  },
  transport: {
    label: 'Ride',
    plural: 'Rides & airport',
    blurb: 'Airport, shuttle and local rides to and from the Academy.',
    timeLabel: 'Pickup time',
    timeHelp: 'When the cadet should be ready at the pickup point.',
    prepaid: false,
    fields: [
      {
        key: 'direction',
        label: 'Direction',
        type: 'select',
        required: true,
        half: true,
        options: [
          { value: 'depart', label: 'Leaving the Academy' },
          { value: 'return', label: 'Returning to the Academy' },
        ],
      },
      { key: 'passengers', label: 'Riders', type: 'number', placeholder: '1', half: true },
      { key: 'pickupPlace', label: 'Pickup point', type: 'text', placeholder: 'Sijan ECP', required: true, half: true },
      { key: 'destination', label: 'Destination', type: 'text', placeholder: 'COS Airport — departures', required: true, half: true },
      { key: 'airline', label: 'Airline', type: 'text', placeholder: 'Southwest', half: true },
      { key: 'flight', label: 'Flight number', type: 'text', placeholder: 'WN 1234', half: true },
      { key: 'flightTime', label: 'Flight departs / arrives', type: 'time', half: true },
      { key: 'luggage', label: 'Bags', type: 'number', placeholder: '2', half: true },
    ],
    statusLabels: { picking_up: 'Driver on the way', picked_up: 'Rider picked up', en_route: 'En route', delivered: 'Dropped off' },
  },
  other: {
    label: 'Other',
    plural: 'Something else',
    blurb: 'Returns, signature deliveries, special requests.',
    timeLabel: 'Requested time',
    timeHelp: '',
    prepaid: false,
    fields: [{ key: 'description', label: 'What do you need?', type: 'textarea', required: true, placeholder: 'Return an Amazon package at the UPS store…' }],
  },
};

export function statusLabel(status: OrderStatus, category?: Category | null): string {
  if (category) {
    const override = CATEGORIES[category]?.statusLabels?.[status];
    if (override) return override;
  }
  return STATUS_LABELS[status];
}

/** Short human summary of an order's specifics for lists and texts. */
export function detailSummary(category: Category, details: Record<string, unknown>): string {
  const d = details as Record<string, string | number | boolean | undefined>;
  switch (category) {
    case 'food':
    case 'birthday':
    case 'grocery':
      return [d.vendor, d.orderNumber ? `#${String(d.orderNumber).replace(/^#/, '')}` : null, d.orderName].filter(Boolean).join(' · ');
    case 'package':
      return [d.carrier ? String(d.carrier).toUpperCase() : null, d.tracking, d.signature ? 'signature' : null].filter(Boolean).join(' · ');
    case 'laundry':
      return [d.bagLabel, d.returnDate ? `return ${d.returnDate}` : null].filter(Boolean).join(' · ');
    case 'transport':
      return [d.pickupPlace && d.destination ? `${d.pickupPlace} → ${d.destination}` : null, d.flight ? `${d.airline ?? ''} ${d.flight}`.trim() : null]
        .filter(Boolean)
        .join(' · ');
    default:
      return String(d.description ?? '').slice(0, 80);
  }
}

export function vendorOf(details: Record<string, unknown>): string | null {
  const v = details?.vendor;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// Notification templates. Every message the system sends is defined here with a
// sensible default; the organizer can rewrite any of them from Settings →
// Notifications without touching code.

export type Audience = 'staff' | 'customer' | 'cadet' | 'payer' | 'helper' | 'organizer' | 'anyone';

export interface TemplateDef {
  label: string;
  description: string;
  audience: Audience;
  sms: string;
  subject: string;
  email: string;
  channels: { sms: boolean; email: boolean };
}

export interface TemplateOverride {
  sms?: string;
  subject?: string;
  email?: string;
  channels?: { sms?: boolean; email?: boolean };
}

export const TEMPLATE_VARIABLES: Record<string, string> = {
  business: 'Your business name',
  organizer: 'Organizer name',
  driver: 'Name of the person delivering',
  cadet: "Cadet's full name",
  cadetFirst: "Cadet's first name",
  cadetLast: "Cadet's last name",
  sender: 'Person who placed the order',
  service: 'Service name',
  vendor: 'Store or restaurant',
  ref: 'Order reference',
  date: 'Service date',
  time: 'Scheduled time',
  location: 'Delivery location',
  eta: 'Estimated arrival time',
  amount: 'Amount due',
  paymentNote: 'Payment status or link',
  note: 'Note added with the update',
  link: 'Link to the order or page',
  message: 'Message text',
  title: 'Announcement title',
  name: 'Person name',
  method: 'Payment method',
};

export const TEMPLATES = {
  order_submitted: {
    label: 'New request received',
    description: 'Sent to you (and dispatch helpers) when a new order comes in.',
    audience: 'staff',
    sms: 'New request {ref}: {service} for {cadet} on {date} at {time}. {link}',
    subject: 'New request {ref} — {service}',
    email: 'A new request was submitted.\n\n{service} for {cadet}\n{date} at {time}\nPlaced by {sender}\n\nReview it: {link}',
    channels: { sms: true, email: true },
  },
  order_proposed: {
    label: 'Order proposed to cadet',
    description: 'A family member set up an order and asked the cadet to confirm it first.',
    audience: 'cadet',
    sms: '{sender} set up {service} for you on {date} at {time}. Tap to accept or decline: {link}',
    subject: '{sender} set up a delivery for you',
    email: 'Hi {cadetFirst},\n\n{sender} would like to send you {service} on {date} at {time}, delivered to {location}.\n\nAccept or decline here: {link}\n\n— {business}',
    channels: { sms: true, email: true },
  },
  proposal_accepted: {
    label: 'Cadet accepted',
    description: 'Tells the family member their proposed order was accepted.',
    audience: 'customer',
    sms: '{cadetFirst} accepted {service} for {date}. It has been sent to {business}. {link}',
    subject: '{cadetFirst} accepted your order',
    email: '{cadetFirst} accepted {service} for {date} at {time}. The request is now with {business} for confirmation.\n\n{link}',
    channels: { sms: false, email: true },
  },
  proposal_declined: {
    label: 'Cadet declined',
    description: 'Tells the family member their proposed order was declined.',
    audience: 'customer',
    sms: '{cadetFirst} declined {service} for {date}. {note} {link}',
    subject: '{cadetFirst} declined the order',
    email: '{cadetFirst} declined {service} for {date}.\n\n{note}\n\n{link}',
    channels: { sms: true, email: true },
  },
  payment_requested: {
    label: 'Cadet asked family to pay',
    description: 'A cadet placed an order and asked a parent to cover the fee.',
    audience: 'payer',
    sms: '{cadetFirst} asked you to cover {service} ({amount}) on {date}. Pay here: {link}',
    subject: '{cadetFirst} asked you to cover a delivery',
    email: '{cadetFirst} requested {service} on {date} at {time} and asked you to cover the {amount} fee.\n\nPay or review it here: {link}',
    channels: { sms: true, email: true },
  },
  order_confirmed: {
    label: 'Order confirmed',
    description: 'You accepted the request.',
    audience: 'customer',
    sms: 'Confirmed: {service} for {cadetLast} on {date} at {time} → {location}. {paymentNote}',
    subject: 'Confirmed — {service} on {date}',
    email: 'Your request is confirmed.\n\n{service} for {cadet}\n{date} at {time}\nDelivered to {location}\n\n{paymentNote}\n\nTrack it: {link}\n\n— {business}',
    channels: { sms: true, email: true },
  },
  order_declined: {
    label: 'Order declined',
    description: 'You could not take the request.',
    audience: 'customer',
    sms: "Sorry — {business} can't take {service} on {date}. {note}",
    subject: "We can't take this request",
    email: "Sorry — {business} can't take {service} on {date} at {time}.\n\n{note}\n\nReply in the app if you'd like to find another time: {link}",
    channels: { sms: true, email: true },
  },
  payment_reported: {
    label: 'Payment reported',
    description: 'A customer says they sent the delivery fee.',
    audience: 'staff',
    sms: '{sender} sent {amount} via {method} for {ref}. Verify: {link}',
    subject: 'Payment reported — {ref}',
    email: '{sender} reported paying {amount} via {method} for {ref} ({service}).\n\nVerify: {link}',
    channels: { sms: false, email: true },
  },
  payment_confirmed: {
    label: 'Payment received',
    description: 'You verified the payment.',
    audience: 'payer',
    sms: 'Payment received for {ref} — thank you!',
    subject: 'Payment received — {ref}',
    email: 'Thank you! Payment of {amount} for {service} ({ref}) was received.\n\n— {business}',
    channels: { sms: false, email: true },
  },
  picking_up: {
    label: 'Heading to pickup',
    description: 'Driver tapped "Heading to pickup" in Run Mode.',
    audience: 'customer',
    sms: '{driver} is heading to {vendor} for {cadetLast}. Delivery to {location} around {eta}.',
    subject: 'On the way to pick up {service}',
    email: '{driver} is heading to {vendor} to pick up {service}. Expected at {location} around {eta}.\n\nTrack: {link}',
    channels: { sms: false, email: false },
  },
  picked_up: {
    label: 'Picked up',
    description: 'Driver has the order in hand.',
    audience: 'customer',
    sms: 'Picked up: {service} for {cadetLast}. {note}',
    subject: 'Picked up — {service}',
    email: '{service} for {cadet} has been picked up. {note}\n\nTrack: {link}',
    channels: { sms: false, email: false },
  },
  en_route: {
    label: 'On the way (ETA)',
    description: 'Driver posted an ETA. This is the text that replaces texting while driving.',
    audience: 'customer',
    sms: 'On the way! {service} for {cadetLast} arrives at {location} around {eta}. {note} Track: {link}',
    subject: 'On the way — ETA {eta}',
    email: '{service} for {cadet} is on the way to {location}. ETA {eta}.\n\n{note}\n\nTrack: {link}',
    channels: { sms: true, email: false },
  },
  delivered: {
    label: 'Delivered',
    description: 'Order dropped off. Includes the proof-of-delivery photo link.',
    audience: 'customer',
    sms: 'Delivered: {service} for {cadetLast} is at {location}. {note} Photo: {link}',
    subject: 'Delivered — {service}',
    email: '{service} for {cadet} was delivered to {location}.\n\n{note}\n\nSee the delivery photo: {link}\n\nThank you for choosing {business}!',
    channels: { sms: true, email: true },
  },
  surprise_heads_up: {
    label: 'Surprise heads-up (to cadet)',
    description: 'For "when and where" surprises — tells the cadet to be there without spoiling it.',
    audience: 'cadet',
    sms: 'Heads up, {cadetFirst}! Something is arriving for you at {location} around {eta}. Be there if you can!',
    subject: 'Something is on the way for you',
    email: 'Hi {cadetFirst},\n\nSomething is arriving for you at {location} around {eta}. No spoilers — just be there if you can!\n\n— {business}',
    channels: { sms: true, email: false },
  },
  surprise_delivered: {
    label: 'Surprise delivered (to cadet)',
    description: 'Reveals the surprise once it is on the shelf.',
    audience: 'cadet',
    sms: 'Surprise, {cadetFirst}! {sender} sent you something — it is waiting at {location}. {link}',
    subject: 'Surprise! Something is waiting for you',
    email: 'Surprise, {cadetFirst}!\n\n{sender} sent you something special. It is waiting for you at {location}.\n\n{link}',
    channels: { sms: true, email: true },
  },
  order_cancelled: {
    label: 'Order cancelled',
    description: 'An order was cancelled by the customer or by you.',
    audience: 'anyone',
    sms: '{ref} ({service} on {date}) was cancelled. {note}',
    subject: 'Cancelled — {ref}',
    email: '{service} for {cadet} on {date} ({ref}) was cancelled.\n\n{note}',
    channels: { sms: true, email: true },
  },
  reminder: {
    label: 'Day-before reminder',
    description: 'Sent automatically the evening before a delivery.',
    audience: 'customer',
    sms: 'Reminder: {service} for {cadetLast} tomorrow at {time} → {location}. {paymentNote}',
    subject: 'Tomorrow — {service}',
    email: 'A reminder that {service} for {cadet} is scheduled tomorrow ({date}) at {time}, delivered to {location}.\n\n{paymentNote}\n\n{link}',
    channels: { sms: false, email: true },
  },
  message: {
    label: 'New message',
    description: 'A new chat message — only sent by text/email when the person is not in the app.',
    audience: 'anyone',
    sms: '{name}: {message} — Reply: {link}',
    subject: 'New message from {name}',
    email: '{name} wrote:\n\n{message}\n\nReply: {link}',
    channels: { sms: true, email: false },
  },
  announcement: {
    label: 'Announcement',
    description: 'Used when you choose to text or email an announcement.',
    audience: 'anyone',
    sms: '{business}: {title} — {message} {link}',
    subject: '{title}',
    email: '{message}\n\n{link}\n\n— {business}',
    channels: { sms: false, email: true },
  },
  assigned: {
    label: 'Delivery assigned (to helper)',
    description: 'Tells a helper they have been given an order.',
    audience: 'helper',
    sms: 'Assigned to you: {ref} {service} — {date} {time}, {vendor} → {location}. {link}',
    subject: 'Assigned — {ref}',
    email: 'You have been assigned {ref}: {service} on {date} at {time}.\nPickup: {vendor}\nDeliver to: {location}\n\n{link}',
    channels: { sms: true, email: true },
  },
  helper_application: {
    label: 'Helper application',
    description: 'Someone asked to join your team as a helper.',
    audience: 'organizer',
    sms: '{name} applied to help with {business}. Review: {link}',
    subject: 'Helper application — {name}',
    email: '{name} applied to be a helper.\n\n{message}\n\nApprove or decline: {link}',
    channels: { sms: true, email: true },
  },
  helper_approved: {
    label: 'Helper approved',
    description: 'Welcome message once you approve a helper.',
    audience: 'helper',
    sms: "You're approved to help with {business}. Sign in: {link}",
    subject: "You're on the team",
    email: "Welcome aboard! You're approved to help with {business}.\n\nSign in to see your deliveries: {link}",
    channels: { sms: true, email: true },
  },
} satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function resolveTemplate(key: TemplateKey, override?: TemplateOverride | null): TemplateDef {
  const base: TemplateDef = TEMPLATES[key];
  if (!override) return base;
  return {
    ...base,
    sms: override.sms ?? base.sms,
    subject: override.subject ?? base.subject,
    email: override.email ?? base.email,
    channels: {
      sms: override.channels?.sms ?? base.channels.sms,
      email: override.channels?.email ?? base.channels.email,
    },
  };
}

/** Fill {placeholders}. Unknown/empty values collapse cleanly. */
export function renderTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = vars[k];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

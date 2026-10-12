// Optional starter content offered during first-run setup. Nothing here is
// loaded unless the organizer ticks the matching box; all of it is editable.
import type { Category } from './domain';

export interface StarterService {
  name: string;
  category: Category;
  feeCents: number;
  description: string;
  instructions: string;
}

export const STARTER_SERVICES: StarterService[] = [
  {
    name: 'Group food order',
    category: 'food',
    feeCents: 1000,
    description: 'Join a scheduled weekly group run.',
    instructions:
      'Order in the restaurant app under your cadet\'s last name (e.g. CADET SMITH) for the run\'s pickup time. Choose bottled drinks — fountain drinks cause mix-ups on group pickups.',
  },
  {
    name: 'Individual food order',
    category: 'food',
    feeCents: 2000,
    description: 'Your own restaurant pickup on the day and time you choose.',
    instructions: "Order and pay in the restaurant's app under your cadet's last name. List the driver as the pickup person only if the app offers it.",
  },
  {
    name: 'Birthday delivery — single stop',
    category: 'birthday',
    feeCents: 2000,
    description: 'One bakery or shop — cake, cupcakes, cookies.',
    instructions: 'Order under your cadet\'s last name. Mark it as a surprise if you want it kept secret.',
  },
  {
    name: 'Birthday delivery — multiple stops',
    category: 'birthday',
    feeCents: 3500,
    description: 'Food plus bakery, or several stops for a celebration.',
    instructions: 'List every stop and order number in the details so nothing is missed.',
  },
  {
    name: 'Birthday sharing essentials bag',
    category: 'other',
    feeCents: 2000,
    description: 'Plates, napkins, silverware, candles, cake server and favors for eight.',
    instructions: '',
  },
  {
    name: 'Grocery & goods delivery',
    category: 'grocery',
    feeCents: 2000,
    description: 'Curbside pickup from Walmart, King Soopers, Target and others.',
    instructions: 'Add bags to your order — Colorado stores charge for them.',
  },
  {
    name: 'Package delivery',
    category: 'package',
    feeCents: 1500,
    description: 'Ship to the organizer\'s address; delivered by hand.',
    instructions: 'Use the shipping address shown on this page. Address it to the organizer with your cadet\'s name on the second line.',
  },
  {
    name: 'Laundry pickup & return',
    category: 'laundry',
    feeCents: 2500,
    description: 'Collected from the delivery nook and returned clean.',
    instructions: 'The bag must be labeled with first and last name.',
  },
  {
    name: 'Dry cleaning pickup & return',
    category: 'laundry',
    feeCents: 2500,
    description: 'Collected from the delivery nook and returned pressed.',
    instructions: 'The bag must be labeled with first and last name.',
  },
  {
    name: 'Shuttle connection (Park & Ride)',
    category: 'transport',
    feeCents: 2000,
    description: 'To or from the airport shuttle stop.',
    instructions: 'Include the airline, flight number and flight time.',
  },
  {
    name: 'Airport ride (COS)',
    category: 'transport',
    feeCents: 5000,
    description: 'Direct ride to or from Colorado Springs Airport.',
    instructions: 'Include the airline, flight number and flight time.',
  },
  {
    name: 'Local ride',
    category: 'transport',
    feeCents: 2000,
    description: 'Ride to or from a nearby destination.',
    instructions: '',
  },
];

export const STARTER_LOCATIONS = [
  { name: 'Arnold Hall — delivery shelf', details: 'Richter Lounge food court, shelf by the soda machines.' },
  { name: 'Sijan Hall ECP', details: 'Entry control point by Sijan Hall.' },
  { name: 'Vandenberg Hall ECP', details: 'Entry control point by Vandenberg Hall.' },
];

export function starterClassYears(now: Date = new Date()): string[] {
  // Academic year rolls over in summer; the senior class graduates the following May.
  const y = now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
  return [String(y), String(y + 1), String(y + 2), String(y + 3), `Prep ${y + 4}`];
}

export const STARTER_DORMS = ['Vandenberg Hall', 'Sijan Hall', 'Prep Alpha', 'Prep Bravo', 'Prep Charlie'];
export const STARTER_SQUADRONS = Array.from({ length: 40 }, (_, i) => `CS-${String(i + 1).padStart(2, '0')}`);

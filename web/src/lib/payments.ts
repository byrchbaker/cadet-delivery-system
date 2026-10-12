import { money, type OrderDTO } from '@cds/shared';

/** Payment links may contain {amount}, {ref} and {note} — e.g. a Venmo or PayPal link with the amount pre-filled. */
export function paymentUrl(url: string, order: Pick<OrderDTO, 'ref' | 'totalCents' | 'serviceName' | 'cadet'>): string {
  const amount = (order.totalCents / 100).toFixed(2);
  const note = `${order.serviceName} #${order.ref} — ${order.cadet.lastName}`;
  return url
    .replace(/\{amount\}/g, encodeURIComponent(amount))
    .replace(/\{ref\}/g, encodeURIComponent(order.ref))
    .replace(/\{note\}/g, encodeURIComponent(note));
}

export const paymentMemo = (order: Pick<OrderDTO, 'ref' | 'totalCents' | 'cadet'>) => `#${order.ref} ${order.cadet.lastName} ${money(order.totalCents)}`;

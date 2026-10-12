import crypto from 'node:crypto';
import express, { Router } from 'express';
import { formatPhone, toE164 } from '@cds/shared';
import { smsConfig } from '../notify/providers';
import { notify } from '../notify';
import { siteUrl } from '../lib/settings';
import { routeInboundSms } from '../lib/threads';
import { organizers } from '../lib/users';

export const webhookRoutes = Router();

function validTwilioSignature(url: string, params: Record<string, string>, signature: string | undefined, authToken: string): boolean {
  if (!signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Twilio "A message comes in" webhook. Point your Twilio number at
 * https://YOUR-SITE/api/webhooks/sms and replies to delivery texts land in the inbox.
 */
webhookRoutes.post('/webhooks/sms', express.urlencoded({ extended: false }), (req, res) => {
  const cfg = smsConfig();
  const params = req.body as Record<string, string>;
  if (!cfg) {
    res.status(503).type('text/plain').send('SMS not configured');
    return;
  }
  const url = `${siteUrl()}${req.originalUrl}`;
  if (!validTwilioSignature(url, params, req.get('x-twilio-signature'), cfg.authToken)) {
    res.status(403).type('text/plain').send('Invalid signature');
    return;
  }
  const from = toE164(params.From);
  const body = (params.Body ?? '').trim().slice(0, 1600);
  if (from && body) {
    const routed = routeInboundSms(from, body);
    if (!routed) {
      notify({
        event: 'message',
        to: organizers(),
        vars: { name: formatPhone(from), message: `${body} (unknown number — not linked to an account)` },
        link: '/app/inbox',
        channels: { sms: false, email: true },
      });
    }
  }
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

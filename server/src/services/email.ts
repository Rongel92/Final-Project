// Central email seam for the resale system.
//
// This is intentionally a thin, single point of delivery so the email pipeline —
// both automatic (triggered by actions) and manual (admin-composed) — is wired
// here without touching call sites. When EMAIL_TRANSPORT=graph, delivery goes
// through Microsoft Graph app-only (client-credentials) using the configured
// Entra tenant / client / secret. Otherwise the message is logged.

import { config } from '../config';
import { proxyFetch } from './http';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Renders the plain-text body as HTML.
function bodyToHtml(text: string): string {
  const bodyHtml = escapeHtml(text).replace(/\r?\n/g, '<br>');
  return (
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5;">` +
    bodyHtml +
    `</div>`
  );
}

function recipients(value: string | string[]): { emailAddress: { address: string } }[] {
  return (Array.isArray(value) ? value : [value])
    .map((v) => v.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

async function getGraphToken(): Promise<string> {
  const { tenantId, clientId, clientSecret } = config.email.graph;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Graph email transport requires ENTRA_TENANT_ID/CLIENT_ID/CLIENT_SECRET.');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await proxyFetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Graph token request failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Graph token response had no access_token.');
  return json.access_token;
}

async function sendViaGraph(message: EmailMessage): Promise<void> {
  const token = await getGraphToken();
  const from = config.email.from;
  const graphMessage: Record<string, unknown> = {
    subject: message.subject,
    body: { contentType: 'HTML', content: bodyToHtml(message.body) },
    toRecipients: recipients(message.to),
  };
  if (message.cc) graphMessage.ccRecipients = recipients(message.cc);
  if (message.replyTo) graphMessage.replyTo = recipients(message.replyTo);
  const attachments: Record<string, unknown>[] = (message.attachments ?? []).map((a) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.filename,
    contentType: a.contentType ?? 'application/octet-stream',
    contentBytes: a.content.toString('base64'),
  }));
  if (attachments.length) graphMessage.attachments = attachments;
  const res = await proxyFetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: graphMessage, saveToSentItems: true }),
    }
  );
  if (!res.ok) {
    throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  }
}

function logEmail(message: EmailMessage): void {
  console.log(
    `[email] (logged, no transport)\n` +
      `To: ${Array.isArray(message.to) ? message.to.join(', ') : message.to}\n` +
      (message.cc ? `Cc: ${Array.isArray(message.cc) ? message.cc.join(', ') : message.cc}\n` : '') +
      (message.replyTo ? `Reply-To: ${message.replyTo}\n` : '') +
      (message.attachments && message.attachments.length
        ? `Attachments: ${message.attachments
            .map((a) => `${a.filename} (${a.content.length} bytes)`)
            .join(', ')}\n`
        : '') +
      `Subject: ${message.subject}\n\n` +
      message.body
  );
}

// Outbound pacing. Graph/Exchange throttles bursts (a resale publish fans out
// one message per registration), so messages are queued and released in batches
// of 10 — 5s between messages, then a 60s pause before the next batch.
const EMAIL_BATCH_SIZE = 10;
const DELAY_BETWEEN_EMAILS_MS = 5_000;
const DELAY_BETWEEN_BATCHES_MS = 60_000;

const outbox: EmailMessage[] = [];
let draining = false;
let sentInBatch = 0;
let lastSentAt = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function drainOutbox(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (outbox.length > 0) {
      const sinceLast = Date.now() - lastSentAt;
      // An idle gap longer than the batch pause already serves as that pause.
      if (sinceLast >= DELAY_BETWEEN_BATCHES_MS) sentInBatch = 0;

      if (sentInBatch >= EMAIL_BATCH_SIZE) {
        await sleep(Math.max(0, DELAY_BETWEEN_BATCHES_MS - sinceLast));
        sentInBatch = 0;
      } else if (sentInBatch > 0 && sinceLast < DELAY_BETWEEN_EMAILS_MS) {
        await sleep(DELAY_BETWEEN_EMAILS_MS - sinceLast);
      }

      const message = outbox.shift()!;
      try {
        await sendViaGraph(message);
      } catch (err) {
        console.error(
          `[email] delivery failed for "${message.subject}":`,
          err instanceof Error ? err.message : err
        );
      }
      sentInBatch += 1;
      lastSentAt = Date.now();
    }
  } finally {
    draining = false;
  }
}

// Queues the message and returns once it is accepted, not once it is delivered,
// so a bulk fan-out never blocks the request that triggered it.
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (config.email.transport !== 'graph') {
    logEmail(message);
    return;
  }
  outbox.push(message);
  void drainOutbox();
}

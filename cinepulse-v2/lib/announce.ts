/**
 * Announcement emails to members ("the new CinePulse is here").
 *
 * - Only real members: no AI personas, no seed/demo accounts, no test or dummy addresses,
 *   and nobody who turned off "product news".
 * - Each member gets a campaign at most once: a row is claimed before sending, so retries and
 *   overlapping batches can never double-send.
 * - Every email carries a one-time unsubscribe link (and List-Unsubscribe headers).
 * - Sent in small batches with a pause between messages to stay inside mail-provider limits.
 */
import { randomBytes } from 'node:crypto';
import { db, now, realUsersOnly } from './db';
import { isDummyOrTestEmail } from './mailer';
import { renderWhatsNewEmail, renderWhatsNewText, whatsNewSubject } from './announceEmail';

export const CAMPAIGN = 'whats-new-2026-11';

export type Deliver = (msg: { to: string; subject: string; html: string; text: string; headers: Record<string, string> }) => Promise<boolean>;

interface Recipient { id: string; email: string; name: string }

async function eligible(): Promise<Recipient[]> {
  const rows = (await db().all(
    `SELECT u.id, u.email, COALESCE(u.display_name, u.name) AS name
     FROM users u LEFT JOIN notification_prefs p ON p.user_id = u.id
     WHERE ${realUsersOnly('u')} AND COALESCE(p.product_updates, 1) = 1
     ORDER BY u.created_at ASC`,
  )) as Array<{ id: string; email: string; name: string }>;
  return rows.filter((r) => r.email && !isDummyOrTestEmail(String(r.email))).map((r) => ({ id: String(r.id), email: String(r.email), name: String(r.name || '') }));
}

export interface CampaignStats { campaign: string; eligible: number; sent: number; failed: number; remaining: number; optedOut: number }

export async function campaignStats(campaign = CAMPAIGN): Promise<CampaignStats> {
  const list = await eligible();
  const rows = (await db().all('SELECT user_id, status FROM email_campaign_sends WHERE campaign = ?', campaign)) as Array<{ user_id: string; status: string }>;
  const sent = new Set(rows.filter((r) => r.status === 'sent').map((r) => r.user_id));
  const failed = new Set(rows.filter((r) => r.status === 'failed').map((r) => r.user_id));
  const optedOut = Number(((await db().get('SELECT COUNT(*) AS n FROM notification_prefs WHERE product_updates = 0')) as { n?: number } | undefined)?.n || 0);
  return {
    campaign,
    eligible: list.length,
    sent: list.filter((r) => sent.has(r.id)).length,
    failed: list.filter((r) => failed.has(r.id)).length,
    remaining: list.filter((r) => !sent.has(r.id) && !failed.has(r.id)).length,
    optedOut,
  };
}

function message(r: { email: string; name: string }, origin: string, token: string) {
  const unsubscribeUrl = `${origin.replace(/\/$/, '')}/api/email/unsubscribe?t=${token}`;
  return {
    to: r.email,
    subject: whatsNewSubject(),
    html: renderWhatsNewEmail({ name: r.name, email: r.email, origin, unsubscribeUrl }),
    text: renderWhatsNewText({ name: r.name, origin, unsubscribeUrl }),
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Sends one batch to members who haven't had this campaign yet. Safe to call repeatedly. */
export async function sendBatch(deliver: Deliver, origin: string, opts: { limit?: number; pauseMs?: number; campaign?: string } = {}): Promise<CampaignStats & { batchSent: number; batchFailed: number }> {
  const campaign = opts.campaign ?? CAMPAIGN;
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));
  const done = new Set(((await db().all('SELECT user_id FROM email_campaign_sends WHERE campaign = ?', campaign)) as Array<{ user_id: string }>).map((r) => r.user_id));
  const todo = (await eligible()).filter((r) => !done.has(r.id)).slice(0, limit);
  let batchSent = 0;
  let batchFailed = 0;
  for (const r of todo) {
    const token = randomBytes(18).toString('base64url');
    // Claim first: a concurrent batch that got here first wins, and this one skips the member.
    const claim = await db().run(
      `INSERT INTO email_campaign_sends (campaign, user_id, email, token, status, sent_at) VALUES (?, ?, ?, ?, 'sending', ?) ON CONFLICT(campaign, user_id) DO NOTHING`,
      campaign, r.id, r.email, token, now(),
    );
    if (!claim.changes) continue;
    let ok = false;
    let error: string | null = null;
    try { ok = await deliver(message(r, origin, token)); } catch (e) { error = (e as Error).message?.slice(0, 200) || 'send failed'; }
    await db().run('UPDATE email_campaign_sends SET status = ?, error = ?, sent_at = ? WHERE campaign = ? AND user_id = ?', ok ? 'sent' : 'failed', ok ? null : error ?? 'not accepted by the mail provider', now(), campaign, r.id);
    if (ok) batchSent++; else batchFailed++;
    if (opts.pauseMs !== 0) await new Promise((res) => setTimeout(res, opts.pauseMs ?? 550));
  }
  return { ...(await campaignStats(campaign)), batchSent, batchFailed };
}

/** Every send for the campaign, newest first, for the admin page (admins already see member emails). */
export async function campaignSends(campaign = CAMPAIGN): Promise<Array<{ email: string; status: string; error: string | null; sentAt: string }>> {
  const rows = (await db().all('SELECT email, status, error, sent_at FROM email_campaign_sends WHERE campaign = ? ORDER BY sent_at DESC LIMIT 500', campaign)) as Array<{ email: string; status: string; error: string | null; sent_at: string }>;
  return rows.map((r) => ({ email: String(r.email), status: String(r.status), error: r.error ?? null, sentAt: String(r.sent_at) }));
}

/** Which mail route is configured, without revealing any secret. */
export function mailSetup(env: NodeJS.ProcessEnv = process.env): { route: 'smtp' | 'resend' | 'none'; smtpHost: string | null; from: string | null; resendDefaultSender: boolean } {
  const smtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  const resend = Boolean(env.RESEND_API_KEY);
  const from = smtp ? (env.SMTP_FROM || env.SMTP_USER || null) : resend ? (env.EMAIL_FROM || 'CinePulse <onboarding@resend.dev>') : null;
  return { route: smtp ? 'smtp' : resend ? 'resend' : 'none', smtpHost: smtp ? String(env.SMTP_HOST) : null, from, resendDefaultSender: !smtp && resend && !env.EMAIL_FROM };
}

/** Failed sends become eligible again (e.g. after fixing mail settings). */
export async function retryFailed(campaign = CAMPAIGN): Promise<number> {
  const res = await db().run("DELETE FROM email_campaign_sends WHERE campaign = ? AND status = 'failed'", campaign);
  return Number(res.changes || 0);
}

/** A test copy to one address (the admin's own), with a non-working sample unsubscribe link. */
export async function sendTest(deliver: Deliver, origin: string, to: { email: string; name: string }): Promise<boolean> {
  return deliver(message(to, origin, 'test-preview'));
}

export function previewHtml(origin: string, name = 'Asha'): string {
  return message({ email: 'you@example.com', name }, origin, 'preview').html;
}

/** One-click unsubscribe from product news. Returns whether the link was valid. */
export async function unsubscribe(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return false;
  const row = (await db().get('SELECT user_id FROM email_campaign_sends WHERE token = ?', token)) as { user_id?: string } | undefined;
  if (!row?.user_id) return false;
  await db().run(
    `INSERT INTO notification_prefs (user_id, watchlist_reminders, email_reminders, product_updates, updated_at) VALUES (?, 1, 0, 0, ?)
     ON CONFLICT(user_id) DO UPDATE SET product_updates = 0, updated_at = excluded.updated_at`,
    row.user_id, now(),
  );
  return true;
}

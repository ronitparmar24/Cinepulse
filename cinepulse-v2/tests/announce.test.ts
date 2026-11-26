import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../lib/auth';
import { db } from '../lib/db';
import { CAMPAIGN, campaignStats, previewHtml, retryFailed, sendBatch, unsubscribe, type Deliver } from '../lib/announce';
import { getReminderPrefs } from '../lib/reminders';

const domain = 'member-mail.org'; // not a test domain, so these count as real members
let n = 0;
const member = async (over: { ai?: boolean; seed?: boolean; email?: string } = {}) => {
  const { user, token } = await register({ name: `Viewer Number${++n}`, email: over.email ?? `viewer${n}.${Date.now()}@${domain}`, password: 'announce-password-1' });
  if (over.ai) await db().run('UPDATE users SET is_ai = 1 WHERE id = ?', user.id);
  if (over.seed) await db().run('UPDATE users SET is_seed = 1 WHERE id = ?', user.id);
  return { user, token };
};

test('the email: personal greeting, tracked links, one-click unsubscribe, escaped content', () => {
  const html = previewHtml('https://cinepulse.app/', '<Asha>');
  assert.match(html, /Hi &lt;Asha&gt;,/);
  assert.match(html, /utm_campaign=whats-new-2026-11/);
  assert.match(html, /\/api\/email\/unsubscribe\?t=preview/);
  assert.match(html, /Movie Night, together/);
  assert.doesNotMatch(html, /<script/i);
});

test('only real, subscribed members get it — once each — and failures can be retried', async () => {
  // Start from a clean campaign for this test database.
  await db().run('DELETE FROM email_campaign_sends WHERE campaign = ?', CAMPAIGN);
  const real1 = await member();
  const real2 = await member();
  await member({ ai: true });
  await member({ seed: true });
  await member({ email: `someone.${Date.now()}@example.com` });
  const optedOut = await member();
  await db().run(`INSERT INTO notification_prefs (user_id, watchlist_reminders, email_reminders, product_updates, updated_at) VALUES (?, 1, 0, 0, ?)`, optedOut.user.id, new Date().toISOString());

  const inbox: Array<{ to: string; headers: Record<string, string>; html: string }> = [];
  const failFor = new Set([real2.user.email]);
  const deliver: Deliver = async (m) => { if (failFor.has(m.to)) return false; inbox.push(m); return true; };

  const before = await campaignStats();
  const realEmails = new Set([real1.user.email, real2.user.email]);
  assert.ok(before.eligible >= 2);

  let r = await sendBatch(deliver, 'https://cinepulse.app', { limit: 50, pauseMs: 0 });
  const got = new Set(inbox.map((m) => m.to));
  assert.ok(got.has(real1.user.email), 'a real member gets it');
  assert.ok(!got.has(optedOut.user.email), 'opted-out members are skipped');
  assert.ok([...got].every((e) => e.endsWith(`@${domain}`)), 'no AI, seed or test addresses');
  assert.equal(r.remaining, 0);
  assert.ok(r.failed >= 1, 'the failed send is recorded');
  assert.match(inbox[0].headers['List-Unsubscribe'], /^<https:\/\/cinepulse\.app\/api\/email\/unsubscribe\?t=[A-Za-z0-9_-]+>$/);
  assert.equal(inbox[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

  const count = inbox.length;
  r = await sendBatch(deliver, 'https://cinepulse.app', { limit: 50, pauseMs: 0 });
  assert.equal(inbox.length, count, 'running it again sends nothing twice');

  failFor.clear();
  assert.ok(await retryFailed() >= 1);
  await sendBatch(deliver, 'https://cinepulse.app', { limit: 50, pauseMs: 0 });
  assert.ok(inbox.some((m) => m.to === real2.user.email), 'retried after fixing the problem');
  assert.equal(inbox.filter((m) => realEmails.has(m.to)).length, 2);

  // One-click unsubscribe from the link in the email.
  const token = /t=([A-Za-z0-9_-]+)/.exec(inbox.find((m) => m.to === real1.user.email)!.headers['List-Unsubscribe'])![1];
  assert.equal(await unsubscribe('not-a-real-token-value'), false);
  assert.equal(await unsubscribe(token), true);
  assert.equal((await getReminderPrefs(real1.user.id)).productUpdates, false);
});

test('admin endpoints are locked; unsubscribe works by link and by one-click POST', async () => {
  const route = await import('../app/api/[...path]/route');
  const { NextRequest } = await import('next/server');
  const call = (method: 'GET' | 'POST', path: string, headers: Record<string, string> = {}, payload?: unknown) => {
    const [p, q] = path.split('?');
    return route[method](new NextRequest(`http://127.0.0.1:3000/api/${p}${q ? `?${q}` : ''}`, { method, headers: { host: '127.0.0.1:3000', ...(payload ? { 'content-type': 'application/json' } : {}), ...headers }, body: payload ? JSON.stringify(payload) : undefined }), { params: Promise.resolve({ path: p.split('/') }) });
  };
  const { token } = await member();
  const cookie = { cookie: `cinepulse_session=${token}`, origin: 'http://127.0.0.1:3000' };
  assert.equal((await call('GET', 'admin/announce')).status, 401);
  assert.equal((await call('GET', 'admin/announce', cookie)).status, 403, 'members who are not admins');
  assert.equal((await call('POST', 'admin/announce/send', cookie, { confirm: 'SEND' })).status, 403);

  const bad = await call('GET', 'email/unsubscribe?t=nope-nope-nope');
  assert.equal(bad.status, 404);
  assert.match(bad.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await bad.text(), /Link not recognised/);

  const someone = await member();
  await db().run(`INSERT INTO email_campaign_sends (campaign, user_id, email, token, status, sent_at) VALUES ('x', ?, ?, 'one-click-token-123', 'sent', ?)`, someone.user.id, someone.user.email, new Date().toISOString());
  const post = await call('POST', 'email/unsubscribe?t=one-click-token-123'); // from a mail provider: no Origin header
  assert.equal(post.status, 200, 'one-click unsubscribe is allowed cross-origin');
  assert.equal((await getReminderPrefs(someone.user.id)).productUpdates, false);
});

test('admin page diagnostics: mail route without secrets', async () => {
  const { mailSetup } = await import('../lib/announce');
  const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;
  assert.deepEqual(mailSetup(env({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'me@gmail.com', SMTP_PASS: 'secret' })), { route: 'smtp', smtpHost: 'smtp.gmail.com', from: 'me@gmail.com', resendDefaultSender: false });
  assert.deepEqual(mailSetup(env({ RESEND_API_KEY: 're_x' })), { route: 'resend', smtpHost: null, from: 'CinePulse <onboarding@resend.dev>', resendDefaultSender: true });
  assert.equal(mailSetup(env({})).route, 'none');
  assert.ok(!JSON.stringify(mailSetup(env({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'hunter2' }))).includes('hunter2'), 'never exposes the password');
});

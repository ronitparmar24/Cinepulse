'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Eye, LoaderCircle, Mail, RefreshCw, Send, Shield, Users } from 'lucide-react';
import { api } from '@/components/client';

interface Stats {
  campaign: string; eligible: number; sent: number; failed: number; remaining: number; optedOut: number;
  setup?: { route: 'smtp' | 'resend' | 'none'; smtpHost: string | null; from: string | null; resendDefaultSender: boolean };
  sends?: Array<{ email: string; status: string; error: string | null; sentAt: string }>;
}

/** Admins only: preview the "new version" email, send yourself a test, then send to every real member in batches. */
export default function AnnouncePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [denied, setDenied] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const stop = useRef(false);

  const load = async () => {
    try { setStats(await api<Stats>('/admin/announce')); setDenied(''); } catch (e) { setDenied((e as Error).message || 'Admin access required'); }
  };
  useEffect(() => { void load(); }, []);

  const test = async () => {
    setTesting(true);
    try { const r = await api<{ ok: boolean; to: string }>('/admin/announce/test', 'POST'); setNote(r.ok ? `Test sent to ${r.to}. Check your inbox (and spam).` : 'The mail provider did not accept the test.'); }
    catch (e) { setNote((e as Error).message); } finally { setTesting(false); }
  };

  const sendAll = async () => {
    setSending(true);
    stop.current = false;
    setNote('');
    try {
      for (let i = 0; i < 500 && !stop.current; i++) {
        const r = await api<Stats & { batchSent: number; batchFailed: number }>('/admin/announce/send', 'POST', { confirm: 'SEND' });
        setStats((prev) => ({ ...r, setup: prev?.setup, sends: prev?.sends }));
        if (r.remaining === 0 || r.batchSent + r.batchFailed === 0) break;
      }
      await load();
      setNote(stop.current ? 'Paused. Press send again to continue where it stopped.' : 'Done. Everyone eligible has been emailed.');
    } catch (e) {
      setNote(`${(e as Error).message} — press send again to continue; nobody gets it twice.`);
    } finally {
      setSending(false);
      setConfirm('');
    }
  };

  const retry = async () => {
    try { const r = await api<{ reset: number }>('/admin/announce/retry', 'POST'); setNote(`${r.reset} failed sends will be retried on the next send.`); await load(); } catch (e) { setNote((e as Error).message); }
  };

  const pct = stats && stats.eligible ? Math.round(((stats.sent + stats.failed) / stats.eligible) * 100) : 0;
  return (
    <main className="mod-page">
      <header className="mod-head">
        <Link href="/" className="text-link"><ArrowLeft size={15} /> Back to CinePulse</Link>
        <h1><Mail size={24} /> “What’s new” email</h1>
        <p>Goes to real members only — no AI or seed accounts, no test addresses, nobody who turned off product news. Each person gets it once, with a one-click unsubscribe.</p>
      </header>

      {denied ? (
        <div className="mod-empty"><Shield size={28} /><h2>Admins only</h2><p>{denied}. Sign in with an account listed in ADMIN_EMAILS.</p></div>
      ) : !stats ? (
        <div className="mod-empty"><LoaderCircle size={24} className="spin" /><p>Counting members…</p></div>
      ) : (
        <div className="ann">
          <div className="ann-stats">
            <div><Users size={18} /><b>{stats.eligible}</b><small>will receive it</small></div>
            <div><CheckCircle size={18} /><b>{stats.sent}</b><small>sent</small></div>
            <div><Send size={18} /><b>{stats.remaining}</b><small>to go</small></div>
            <div><Shield size={18} /><b>{stats.optedOut}</b><small>opted out</small></div>
          </div>
          {(stats.sent > 0 || sending) && <div className="ann-progress" aria-label={`${pct}% sent`}><i style={{ width: `${pct}%` }} /></div>}

          <ol className="ann-steps">
            <li>
              <b>1. Look at it</b>
              <a className="button secondary" href="/api/admin/announce/preview" target="_blank" rel="noopener noreferrer"><Eye size={15} /> Open preview</a>
            </li>
            <li>
              <b>2. Send yourself a test</b>
              <button type="button" className="button secondary" onClick={() => void test()} disabled={testing}>{testing ? <LoaderCircle size={15} className="spin" /> : <Mail size={15} />} Send test to me</button>
            </li>
            <li>
              <b>3. Send to everyone</b>
              {stats.remaining === 0 ? (
                <p className="ann-done"><CheckCircle size={16} /> Everyone eligible has it.{stats.failed > 0 ? ` ${stats.failed} failed.` : ''}</p>
              ) : (
                <div className="ann-confirm">
                  <label>Type <code>SEND</code> to email {stats.remaining} {stats.remaining === 1 ? 'member' : 'members'}
                    <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="SEND" autoComplete="off" disabled={sending} />
                  </label>
                  {sending ? (
                    <button type="button" className="button secondary" onClick={() => { stop.current = true; }}><LoaderCircle size={15} className="spin" /> Sending… press to pause</button>
                  ) : (
                    <button type="button" className="button primary" disabled={confirm !== 'SEND'} onClick={() => void sendAll()}><Send size={15} /> Send to {stats.remaining}</button>
                  )}
                </div>
              )}
              {stats.failed > 0 && !sending && <button type="button" className="text-link" onClick={() => void retry()}><RefreshCw size={13} /> Retry {stats.failed} failed</button>}
            </li>
          </ol>
          {note && <p className="ann-note" role="status">{note}</p>}

          {stats.setup && (
            <div className="ann-setup">
              <b>Mail setup</b>
              <p>
                {stats.setup.route === 'smtp' && <>Sending through SMTP (<code>{stats.setup.smtpHost}</code>) as <code>{stats.setup.from}</code>.</>}
                {stats.setup.route === 'resend' && <>Sending through Resend as <code>{stats.setup.from}</code>.</>}
                {stats.setup.route === 'none' && <>No mail provider is configured, so nothing can be delivered.</>}
              </p>
              {stats.setup.route === 'smtp' && /gmail|google/i.test(stats.setup.smtpHost ?? '') && (
                <p className="ann-warn">Gmail accepts every message first and reports problems later: look in <b>{stats.setup.from}</b>’s inbox for “Delivery Status Notification” / “Address not found” bounces. Mail from a personal Gmail account to many people often lands in Spam or Promotions; for reliable delivery use a sending service (Resend, Brevo, SendGrid) with your own domain.</p>
              )}
              {stats.setup.resendDefaultSender && (
                <p className="ann-warn">Resend’s default sender only delivers to your own address. Verify a domain in Resend and set <code>EMAIL_FROM</code> to an address on it.</p>
              )}
            </div>
          )}

          {stats.sends && stats.sends.length > 0 && (
            <div className="ann-sends">
              <b>Who it was sent to</b>
              <ul>
                {stats.sends.map((s) => (
                  <li key={s.email} className={`is-${s.status}`}>
                    <span>{s.email}</span>
                    <em>{s.status === 'sent' ? 'Accepted by the mail provider' : s.status === 'failed' ? `Failed${s.error ? ` — ${s.error}` : ''}` : 'Sending…'}</em>
                    <small>{new Date(s.sentAt).toLocaleString('en-IN')}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

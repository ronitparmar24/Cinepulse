'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, EyeOff, Flag, RefreshCw, RotateCcw, Shield } from 'lucide-react';
import { api } from '@/components/client';

interface ReportGroup {
  targetType: 'review' | 'comment';
  targetId: string;
  hidden: boolean;
  author: { id: string; name: string } | null;
  excerpt: string;
  titleName: string | null;
  reports: number;
  reasons: Record<string, number>;
  notes: string[];
  firstReportedAt: string;
}

const REASON_LABEL: Record<string, string> = { spoilers: 'Spoilers', harassment: 'Harassment', spam: 'Spam', off_topic: 'Off-topic', other: 'Other' };

/** Moderation queue for ADMIN_EMAILS: open reports grouped by post, with hide / restore / dismiss. */
export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportGroup[] | null>(null);
  const [denied, setDenied] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ reports: ReportGroup[] }>('/admin/reports');
      setReports(res.reports);
      setDenied('');
    } catch (e) {
      setDenied((e as Error).message || 'Admin access required');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function act(g: ReportGroup, action: 'hide' | 'restore' | 'dismiss') {
    setBusy(`${g.targetType}:${g.targetId}`);
    try {
      await api('/admin/reports/resolve', 'POST', { targetType: g.targetType, targetId: g.targetId, action });
      setReports((list) => (list ? list.filter((x) => !(x.targetId === g.targetId && x.targetType === g.targetType)) : list));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mod-page">
      <header className="mod-head">
        <Link href="/" className="text-link"><ArrowLeft size={15} /> Back to CinePulse</Link>
        <h1><Shield size={24} /> Moderation queue</h1>
        <p>Open reports, grouped by post. Posts with {3}+ reports are hidden automatically until you decide.</p>
        <button type="button" className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : undefined} /> Refresh</button>
      </header>

      {denied ? (
        <div className="mod-empty"><Shield size={28} /><h2>Moderators only</h2><p>{denied}. Sign in with an account listed in ADMIN_EMAILS.</p></div>
      ) : !reports ? (
        <div className="mod-empty"><RefreshCw size={24} className="spin" /><p>Loading reports…</p></div>
      ) : reports.length === 0 ? (
        <div className="mod-empty"><CheckCircle size={28} /><h2>All clear</h2><p>No open reports right now.</p></div>
      ) : (
        <ul className="mod-list">
          {reports.map((g) => {
            const key = `${g.targetType}:${g.targetId}`;
            return (
              <li key={key} className="mod-item">
                <div className="mod-meta">
                  <span className="mod-count"><Flag size={13} /> {g.reports} {g.reports === 1 ? 'report' : 'reports'}</span>
                  <span className="mod-kind">{g.targetType}{g.titleName ? ` · ${g.titleName}` : ''}</span>
                  {g.hidden && <span className="mod-hidden"><EyeOff size={12} /> Hidden</span>}
                </div>
                <blockquote>{g.excerpt || '—'}</blockquote>
                <p className="mod-author">by {g.author?.name ?? 'unknown'} · first reported {new Date(g.firstReportedAt).toLocaleString('en-IN')}</p>
                <div className="mod-reasons">{Object.entries(g.reasons).map(([r, n]) => <span key={r}>{REASON_LABEL[r] ?? r} × {n}</span>)}</div>
                {g.notes.length > 0 && <ul className="mod-notes">{g.notes.map((n, i) => <li key={i}>“{n}”</li>)}</ul>}
                <div className="mod-actions">
                  {!g.hidden && <button type="button" className="button danger" disabled={busy === key} onClick={() => void act(g, 'hide')}><EyeOff size={15} /> Hide post</button>}
                  {g.hidden && <button type="button" className="button secondary" disabled={busy === key} onClick={() => void act(g, 'restore')}><RotateCcw size={15} /> Restore post</button>}
                  <button type="button" className="button secondary" disabled={busy === key} onClick={() => void act(g, 'dismiss')}><CheckCircle size={15} /> Dismiss reports</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

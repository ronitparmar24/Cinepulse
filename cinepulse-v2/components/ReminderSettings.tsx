'use client';
import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';
import { saveReminderPrefs, setReminder, useReminderPrefs } from './reminderStore';

interface Upcoming { titleId: string; title: string; poster: string | null; releaseDate: string; source: 'manual' | 'watchlist' }

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Release-reminder preferences and the list of upcoming reminders (profile → Privacy). */
export function ReminderSettings() {
  const { user, toast } = useApp();
  const prefs = useReminderPrefs(user?.id);
  const [items, setItems] = useState<Upcoming[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api<{ reminders: Upcoming[] }>('/reminders')
      .then((r) => { if (alive) setItems(r.reminders); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [user, prefs?.watchlist]);

  if (!user) return null;

  const update = async (next: { watchlist?: boolean; email?: boolean; productUpdates?: boolean }) => {
    try {
      await saveReminderPrefs(next);
      toast(next.email === true ? 'We’ll also email you on release day.' : next.watchlist === false ? 'Watchlist reminders are off.' : next.productUpdates === false ? 'No more product news emails.' : 'Notification settings saved.');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    const before = items;
    setItems((list) => (list ? list.filter((x) => x.titleId !== id) : list));
    try { await setReminder(id, false); } catch (e) { setItems(before); toast((e as Error).message); }
  };

  return (
    <div className="pf-notify">
      <div className="pf-form-head">
        <h3>Notifications</h3>
        <p>Get told the day something you’re waiting for comes out.</p>
      </div>
      <div className="pf-privacy">
        <label className="pf-privacy-row pf-toggle-row">
          <div>
            <b>Remind me about my watchlist</b>
            <small>Upcoming titles you save get a release-day alert</small>
          </div>
          <input type="checkbox" checked={prefs?.watchlist ?? true} disabled={!prefs} onChange={(e) => void update({ watchlist: e.target.checked })} />
          <span className="auth2-switch" aria-hidden="true"><i /></span>
        </label>
        <label className="pf-privacy-row pf-toggle-row">
          <div>
            <b>Also email me</b>
            <small>One short email on release day to {user.email}</small>
          </div>
          <input type="checkbox" checked={prefs?.email ?? false} disabled={!prefs} onChange={(e) => void update({ email: e.target.checked })} />
          <span className="auth2-switch" aria-hidden="true"><i /></span>
        </label>
        <label className="pf-privacy-row pf-toggle-row">
          <div>
            <b>Product news</b>
            <small>An occasional email when we ship something new</small>
          </div>
          <input type="checkbox" checked={prefs?.productUpdates ?? true} disabled={!prefs} onChange={(e) => void update({ productUpdates: e.target.checked })} />
          <span className="auth2-switch" aria-hidden="true"><i /></span>
        </label>
      </div>

      <div className="pf-reminders">
        <span className="pf-reminders-head"><BellRing size={14} /> Upcoming reminders {items ? `(${items.length})` : ''}</span>
        {items === null ? (
          <div className="skeleton pf-skel" />
        ) : items.length === 0 ? (
          <p className="pf-reminders-empty">None yet. Open any upcoming film and tap <b>Remind me</b>.</p>
        ) : (
          <ul>
            {items.slice(0, 8).map((r) => (
              <li key={r.titleId}>
                {r.poster ? <img src={r.poster} alt="" width={30} height={45} /> : <span className="pf-reminders-ph" />}
                <span className="pf-reminders-text"><b>{r.title}</b><small>{fmt(r.releaseDate)}{r.source === 'watchlist' ? ' · from your watchlist' : ''}</small></span>
                <button type="button" onClick={() => void remove(r.titleId)} aria-label={`Remove the reminder for ${r.title}`}><X size={14} /></button>
              </li>
            ))}
            {items.length > 8 && <li className="pf-reminders-more">and {items.length - 8} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

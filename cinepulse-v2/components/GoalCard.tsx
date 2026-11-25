'use client';
import { useEffect, useState } from 'react';
import { Check, Flame, Pencil, Target, X } from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';

interface GoalStatus {
  year: number;
  target: number | null;
  watched: number;
  percent: number | null;
  perWeekToFinish: number | null;
  streak: { current: number; best: number };
  weeks: number[];
}

const PRESETS = [12, 24, 52, 100];

/** Profile dashboard: yearly goal ring, weekly streak and the last 12 weeks. */
export function GoalCard() {
  const { user, toast } = useApp();
  const [status, setStatus] = useState<GoalStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api<GoalStatus>('/goals').then((s) => { if (alive) setStatus(s); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  if (!user || !status) return <div className="skeleton goal-skel" aria-hidden="true" />;

  const save = async (target: number | null) => {
    setBusy(true);
    try {
      const next = await api<GoalStatus>('/goals', 'PUT', { target });
      setStatus(next);
      setEditing(false);
      toast(target ? `Goal set: ${target} titles in ${next.year}.` : 'Goal cleared.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pct = status.percent ?? 0;
  const peak = Math.max(1, ...status.weeks);
  const done = status.target !== null && status.watched >= status.target;

  return (
    <section className={`goal-card ${done ? 'is-done' : ''}`} aria-label={`${status.year} watch goal`}>
      <div className="goal-ring" style={{ '--p': status.target ? pct : 0 } as React.CSSProperties}>
        <div>
          <b>{status.watched}</b>
          <small>{status.target ? `of ${status.target}` : 'watched'}</small>
        </div>
      </div>
      <div className="goal-body">
        <span className="goal-eyebrow"><Target size={13} /> {status.year} goal</span>
        {editing ? (
          <form className="goal-edit" onSubmit={(e) => { e.preventDefault(); const n = Number(draft); if (Number.isInteger(n) && n >= 1 && n <= 1000) void save(n); else toast('Pick a whole number from 1 to 1000.'); }}>
            <div className="goal-presets">
              {PRESETS.map((p) => <button key={p} type="button" className={`tn-chip ${Number(draft) === p ? 'is-on' : ''}`} onClick={() => setDraft(String(p))}>{p}</button>)}
            </div>
            <div className="goal-edit-row">
              <input type="number" inputMode="numeric" min={1} max={1000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Titles to watch this year" placeholder="e.g. 52" />
              <button type="submit" className="icon goal-icon-btn" disabled={busy} aria-label="Save goal"><Check size={16} /></button>
              <button type="button" className="icon goal-icon-btn" onClick={() => setEditing(false)} aria-label="Cancel"><X size={16} /></button>
            </div>
            {status.target !== null && <button type="button" className="text-link muted goal-clear" onClick={() => void save(null)}>Clear goal</button>}
          </form>
        ) : (
          <>
            <h4>
              {status.target === null ? 'Set a yearly goal' : done ? 'Goal reached!' : `${status.target - status.watched} to go`}
            </h4>
            <p>
              {status.target === null
                ? `${status.watched} watched so far this year.`
                : done
                  ? `You’ve watched ${status.watched} titles. Raise the bar?`
                  : `About ${status.perWeekToFinish} a week to finish on time.`}
            </p>
            <button type="button" className="goal-set" onClick={() => { setDraft(status.target ? String(status.target) : '52'); setEditing(true); }}>
              <Pencil size={13} /> {status.target === null ? 'Set goal' : 'Change'}
            </button>
          </>
        )}
      </div>
      <div className="goal-streak">
        <span className={`goal-flame ${status.streak.current > 0 ? 'is-lit' : ''}`}><Flame size={16} /> {status.streak.current}</span>
        <small>{status.streak.current === 1 ? 'week streak' : 'week streak'}{status.streak.best > status.streak.current ? ` · best ${status.streak.best}` : ''}</small>
        <div className="goal-weeks" aria-label="Titles watched in each of the last 12 weeks">
          {status.weeks.map((n, i) => <i key={i} style={{ '--h': `${n ? Math.max(18, (n / peak) * 100) : 6}%` } as React.CSSProperties} className={n ? 'has' : ''} title={`${n} watched`} />)}
        </div>
      </div>
    </section>
  );
}

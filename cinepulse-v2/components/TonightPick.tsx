'use client';
import { useCallback, useEffect, useState } from 'react';
import { Clock3, Dices, LoaderCircle, Play, PlayCircle, Popcorn, Shuffle, Sparkles } from 'lucide-react';
import type { Title } from '@/lib/types';
import { Modal } from './UI';
import { api } from './client';
import { useApp } from './Context';
import { useMyServices } from './ServicesPicker';

export const OPEN_TONIGHT_EVENT = 'cinepulse:open-tonight';
export function openTonight(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_TONIGHT_EVENT));
}

interface Pick { title: Title; services: string[]; reasons: string[] }
interface Result { pick: Pick | null; alternates: Pick[]; considered: number; moods: string[]; message?: string }

const TIMES: Array<{ label: string; minutes: number | null }> = [
  { label: 'Any length', minutes: null },
  { label: 'Under 1½ h', minutes: 90 },
  { label: 'Under 2 h', minutes: 120 },
  { label: 'Under 2½ h', minutes: 150 },
];

export function TonightPick({ onClose }: { onClose: () => void }) {
  const { user, openTitle } = useApp();
  const services = useMyServices(user?.id);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [mood, setMood] = useState('');
  const [servicesOnly, setServicesOnly] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [roll, setRoll] = useState(0);
  const hasServices = Boolean(services?.selected.length);

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    const q = new URLSearchParams();
    if (minutes) q.set('minutes', String(minutes));
    if (mood) q.set('mood', mood);
    if (servicesOnly) q.set('servicesOnly', '1');
    try {
      setResult(await api<Result>(`/tonight?${q.toString()}`));
      setRoll((r) => r + 1);
    } catch (e) {
      setError((e as Error).message || 'Tonight’s pick is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }, [minutes, mood, servicesOnly]);

  useEffect(() => { void run(); /* first pick on open */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (t: Title) => { onClose(); setTimeout(() => openTitle(t.id), 60); };
  const pick = result?.pick;

  return (
    <Modal label="Tonight’s pick" onClose={onClose}>
      <div className="tn">
        <div className="tn-head">
          <span className="tn-orb" aria-hidden="true"><Popcorn size={20} /></span>
          <div>
            <span className="eyebrow mint">FROM YOUR WATCHLIST</span>
            <h2>Tonight’s pick</h2>
          </div>
        </div>

        <div className="tn-options">
          <div className="tn-row" role="group" aria-label="How much time do you have?">
            <Clock3 size={15} aria-hidden="true" />
            {TIMES.map((t) => (
              <button key={t.label} type="button" className={`tn-chip ${minutes === t.minutes ? 'is-on' : ''}`} aria-pressed={minutes === t.minutes} onClick={() => setMinutes(t.minutes)}>{t.label}</button>
            ))}
          </div>
          <div className="tn-row">
            <Sparkles size={15} aria-hidden="true" />
            <label className="tn-select">
              <span className="sr-only">Mood</span>
              <select value={mood} onChange={(e) => setMood(e.target.value)} aria-label="Mood">
                <option value="">Any mood</option>
                {(result?.moods ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className={`tn-toggle ${hasServices ? '' : 'is-disabled'}`} title={hasServices ? '' : 'Choose your services in your profile first'}>
              <input type="checkbox" checked={servicesOnly && hasServices} disabled={!hasServices} onChange={(e) => setServicesOnly(e.target.checked)} />
              <span className="auth2-switch" aria-hidden="true"><i /></span>
              Only my services
            </label>
          </div>
          <button type="button" className="button primary tn-go" onClick={() => void run()} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Dices size={16} />} {result ? 'Pick again' : 'Pick for me'}
          </button>
        </div>

        <div className="tn-result" aria-live="polite">
          {error ? (
            <p className="tn-message">{error}</p>
          ) : !result ? (
            <div className="tn-loading"><LoaderCircle size={22} className="spin" /> Shuffling your watchlist…</div>
          ) : !pick ? (
            <p className="tn-message">{result.message}</p>
          ) : (
            <>
              <article className="tn-card" key={`${pick.title.id}-${roll}`}>
                {pick.title.poster ? <img src={pick.title.poster} alt="" /> : <span className="tn-card-ph"><Popcorn size={26} /></span>}
                <div className="tn-card-body">
                  <h3>{pick.title.title}</h3>
                  <p className="tn-meta">
                    {[pick.title.releaseDate?.slice(0, 4), pick.title.runtime ? `${pick.title.runtime} min` : null, pick.title.genres?.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')}
                  </p>
                  {pick.services.length > 0 && <span className="svc-badge"><PlayCircle size={14} /> On your {pick.services.join(' & ')}</span>}
                  <ul className="tn-reasons">{pick.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <button type="button" className="button primary" onClick={() => open(pick.title)}><Play size={15} /> Open</button>
                </div>
              </article>
              {result.alternates.length > 0 && (
                <div className="tn-alts">
                  <span><Shuffle size={13} /> Or maybe</span>
                  {result.alternates.map((a) => (
                    <button key={a.title.id} type="button" onClick={() => open(a.title)}>
                      {a.title.poster && <img src={a.title.poster} alt="" />}
                      <b>{a.title.title}</b>
                    </button>
                  ))}
                </div>
              )}
              <p className="tn-foot">Chosen from {result.considered} {result.considered === 1 ? 'title' : 'titles'} on your watchlist.</p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

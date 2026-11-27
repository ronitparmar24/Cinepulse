'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BellRing, Check, PlayCircle, Tv } from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';
import './services-alerts.css';

interface ServicesState { region: string; available: Array<{ id: string; name: string }>; selected: string[] }

// Shared, loaded once per signed-in member.
let state: ServicesState | null = null;
let loadedFor: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function loadServices(userId: string | null | undefined, force = false): void {
  if (!userId) { if (loadedFor) { state = null; loadedFor = null; emit(); } return; }
  if (!force && loadedFor === userId) return;
  loadedFor = userId;
  api<ServicesState>('/services')
    .then((s) => { if (loadedFor === userId) { state = s; emit(); } })
    .catch(() => { if (loadedFor === userId) loadedFor = null; });
}

export function useMyServices(userId: string | null | undefined): ServicesState | null {
  useEffect(() => { loadServices(userId); }, [userId]);
  return useSyncExternalStore(subscribe, () => state, () => null);
}

/** Bumps whenever the selection changes, so availability views can refetch. */
export function useServicesVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

async function saveSelected(selected: string[]): Promise<void> {
  const before = state;
  if (state) { state = { ...state, selected }; emit(); }
  try {
    const res = await api<{ selected: string[] }>('/services', 'PUT', { services: selected });
    if (state) { state = { ...state, selected: res.selected }; emit(); }
  } catch (e) {
    state = before;
    emit();
    throw e;
  }
}

/** Profile → Services: tap the services you pay for. */
export function ServicesPicker() {
  const { user, toast, region } = useApp();
  const services = useMyServices(user?.id);
  // Region switches change the list of services offered.
  useEffect(() => { if (user) loadServices(user.id, true); }, [user, region]);
  if (!user) return null;

  const toggle = async (id: string) => {
    if (!services) return;
    const next = services.selected.includes(id) ? services.selected.filter((x) => x !== id) : [...services.selected, id];
    try { await saveSelected(next); } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="pf-form">
      <div className="pf-form-head">
        <h3>Your streaming services</h3>
        <p>Pick what you subscribe to. CinePulse then shows what you can watch right now, and Tonight’s pick can stick to it.</p>
      </div>
      {!services ? (
        <div className="pf-skeletons">{Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton pf-skel" />)}</div>
      ) : (
        <>
          <div className="svc-grid" role="group" aria-label="Streaming services">
            {services.available.map((s, i) => {
              const on = services.selected.includes(s.id);
              return (
                <button key={s.id} type="button" className={`svc-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => void toggle(s.id)} style={{ '--i': i } as React.CSSProperties}>
                  <span className="svc-chip-icon">{on ? <Check size={14} /> : <Tv size={14} />}</span>
                  {s.name}
                </button>
              );
            })}
          </div>
          <p className="svc-note">
            {services.selected.length
              ? `${services.selected.length} selected · ${services.region === 'US' ? 'United States' : 'India'} availability`
              : 'Nothing selected yet.'}
            {' '}Availability comes from TMDB and JustWatch and can lag a day behind.
          </p>
          <p className="svc-alert-note"><BellRing size={14} aria-hidden /> We’ll tell you when something on your watchlist lands on these services.</p>
        </>
      )}
    </div>
  );
}

/** "On your Netflix" for a title, linking to where to watch. Renders nothing without a match. */
export function MyServicesBadge({ titleId }: { titleId: string }) {
  const { user } = useApp();
  const services = useMyServices(user?.id);
  const v = useServicesVersion();
  const [match, setMatch] = useState<{ services: string[]; link: string | null } | null>(null);
  const selectedKey = services?.selected.join(',') ?? '';

  useEffect(() => {
    setMatch(null);
    if (!user || !selectedKey) return;
    const controller = new AbortController();
    api<{ services: string[]; link: string | null }>(`/services/title/${encodeURIComponent(titleId)}`, 'GET', undefined, controller.signal)
      .then(setMatch)
      .catch(() => {});
    return () => controller.abort();
  }, [titleId, user, selectedKey, v]);

  if (!match?.services.length) return null;
  const label = `On your ${match.services.join(' & ')}`;
  return match.link ? (
    <a className="svc-badge" href={match.link} target="_blank" rel="noopener noreferrer"><PlayCircle size={15} /> {label}</a>
  ) : (
    <span className="svc-badge"><PlayCircle size={15} /> {label}</span>
  );
}

/** For the Library: which saved, released titles are on the member's services. */
export function useWatchlistMatches(userId: string | null | undefined, libraryCount: number): { matches: Record<string, string[]>; hasServices: boolean } {
  const services = useMyServices(userId);
  const v = useServicesVersion();
  const [matches, setMatches] = useState<Record<string, string[]>>({});
  const selectedKey = services?.selected.join(',') ?? '';
  useEffect(() => {
    if (!userId || !selectedKey) { setMatches({}); return; }
    const controller = new AbortController();
    api<{ matches: Record<string, string[]> }>('/services/watchlist', 'GET', undefined, controller.signal)
      .then((r) => setMatches(r.matches))
      .catch(() => {});
    return () => controller.abort();
  }, [userId, selectedKey, v, libraryCount]);
  return { matches, hasServices: Boolean(selectedKey) };
}

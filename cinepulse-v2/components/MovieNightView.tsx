'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Ban, Check, Clapperboard, Copy, Crown, ExternalLink, Film, HelpCircle, Link2, LoaderCircle, LogIn, Pause, Play,
  PlayCircle, Plus, Popcorn, Search, Share2, Sparkles, Star, ThumbsDown, ThumbsUp, Trash2, Trophy, Tv, Users, X,
} from 'lucide-react';
import type { PublicRoom } from '@/lib/movieRoom';
import type { Title } from '@/lib/types';
import { api } from './client';
import { useApp } from './Context';
import { celebrate } from './motion/confetti';
import './polish.css';
import './movie-night.css';

type Room = PublicRoom;
type Candidate = Room['candidates'][number];
type Choice = 'yes' | 'maybe' | 'no';

const REACTIONS = ['🍿', '😂', '😱', '😭', '🔥', '👏', '❤️', '🤯'];
const MOODS = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller'];
const RUNTIMES: Array<{ label: string; value: number | null }> = [
  { label: 'Any length', value: null }, { label: '≤ 1h 45', value: 105 }, { label: '≤ 2h 15', value: 135 }, { label: '≤ 3h', value: 180 },
];
const STEPS: Array<{ id: Room['phase']; label: string }> = [
  { id: 'lobby', label: 'Lobby' }, { id: 'voting', label: 'Vote' }, { id: 'reveal', label: 'Reveal' }, { id: 'party', label: 'Watch party' },
];

const tokenKey = (code: string) => `cinepulse_room_${code.toUpperCase()}`;
const readToken = (code: string) => { try { return localStorage.getItem(tokenKey(code)); } catch { return null; } };
const saveToken = (code: string, token: string) => {
  try {
    localStorage.setItem(tokenKey(code), token);
    const recent = JSON.parse(localStorage.getItem('cinepulse_rooms') || '[]').filter((c: string) => c !== code);
    localStorage.setItem('cinepulse_rooms', JSON.stringify([code, ...recent].slice(0, 5)));
  } catch { /* private mode: the room still works for this visit */ }
};
const recentRooms = (): string[] => { try { return JSON.parse(localStorage.getItem('cinepulse_rooms') || '[]'); } catch { return []; } };

function setRoomInUrl(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code); else url.searchParams.delete('room');
  window.history.replaceState(window.history.state, '', url.toString());
}

async function roomApi<T>(path: string, method: 'GET' | 'POST', token: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['x-room-token'] = token;
  const res = await fetch(`/api/movie-night/rooms${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include', cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
  return data as T;
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Live room state: polls cheaply (unchanged → tiny reply) and keeps a server-clock offset. */
function useRoom(code: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const versionRef = useRef(0);
  const token = code ? readToken(code) : null;

  const apply = useCallback((r: Room, sentAt?: number) => {
    versionRef.current = r.version;
    setRoom(r);
    if (sentAt) setOffset(r.serverNow - (sentAt + Date.now()) / 2);
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!code) return;
    const sentAt = Date.now();
    try {
      const res = await roomApi<Room | { unchanged: true; version: number; serverNow: number }>(`/${code}${!force && versionRef.current ? `?v=${versionRef.current}` : ''}`, 'GET', readToken(code));
      if ('unchanged' in res) setOffset(res.serverNow - (sentAt + Date.now()) / 2);
      else apply(res, sentAt);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [code, apply]);

  useEffect(() => {
    versionRef.current = 0;
    setRoom(null);
    setError('');
    if (!code) return;
    void refresh(true);
  }, [code, refresh]);

  const phase = room?.phase;
  useEffect(() => {
    if (!code || phase === 'ended') return;
    const ms = phase === 'party' || phase === 'voting' ? 2500 : 4000;
    let timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, ms);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); timer = 0; document.removeEventListener('visibilitychange', onVisible); };
  }, [code, phase, refresh]);

  const act = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    if (!code) return null;
    const sentAt = Date.now();
    const res = await roomApi<{ room: Room }>(`/${code}/${action}`, 'POST', readToken(code), body);
    apply(res.room, sentAt);
    return res.room;
  }, [code, apply]);

  return { room, error, offset, token, refresh, act, apply };
}

// ─── Landing: create or join ─────────────────────────────────────────────────

function Landing({ onEnter }: { onEnter: (code: string) => void }) {
  const { user, toast } = useApp();
  const [name, setName] = useState('Friday Movie Night');
  const [yourName, setYourName] = useState('');
  const [runtime, setRuntime] = useState<number | null>(135);
  const [mood, setMood] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { setRecent(recentRooms()); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await roomApi<{ room: Room; token: string }>('', 'POST', null, { name, yourName: yourName || undefined, maxRuntime: runtime ?? undefined, mood: mood || undefined, freeOnly });
      saveToken(res.room.code, res.token);
      onEnter(res.room.code);
    } catch (err) { toast((err as Error).message); } finally { setBusy(false); }
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) return toast('Enter the code your host shared.');
    onEnter(c);
  };

  return (
    <div className="mn-landing">
      <header className="mn-hero">
        <span className="eyebrow mint"><Popcorn size={14} /> MOVIE NIGHT</span>
        <h1>Pick a film together.<br /><span className="soft-serif">Press play together.</span></h1>
        <p>Open a room, share the link, and everyone swipes Yes, Maybe or No on a shortlist built from your watchlists. CinePulse reveals the winner, then counts the whole group down so you all hit play at the same second — on your own Netflix, Prime Video or wherever it streams.</p>
        <ol className="mn-how">
          <li><Users size={16} /> Share a link — no account needed</li>
          <li><ThumbsUp size={16} /> Swipe the shortlist, one veto each</li>
          <li><Trophy size={16} /> Reveal the winner and where to watch</li>
          <li><Play size={16} /> Synced countdown, pause and reactions</li>
        </ol>
      </header>

      <div className="mn-cards">
        <form className="mn-card glass" onSubmit={create}>
          <h2><Sparkles size={18} /> Start a room</h2>
          <label className="mn-field"><span>Room name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
          {!user && <label className="mn-field"><span>Your name</span><input value={yourName} onChange={(e) => setYourName(e.target.value)} maxLength={40} placeholder="So friends know it’s you" /></label>}
          <div className="mn-field"><span>How long can you go?</span>
            <div className="mn-chips">{RUNTIMES.map((r) => <button key={r.label} type="button" className={`tn-chip ${runtime === r.value ? 'is-on' : ''}`} aria-pressed={runtime === r.value} onClick={() => setRuntime(r.value)}>{r.label}</button>)}</div>
          </div>
          <label className="mn-field"><span>Mood (optional)</span>
            <select value={mood} onChange={(e) => setMood(e.target.value)}><option value="">Anything goes</option>{MOODS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label className="mn-free-toggle">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
            <span className="auth2-switch" aria-hidden="true"><i /></span>
            <span><b>Free tonight</b><small>Only films you can stream free and legally in your region — no subscription needed</small></span>
          </label>
          <p className="mn-hint">{user ? 'We’ll seed the shortlist from your watchlist, then trending picks. Friends who sign in add theirs too.' : 'Sign in to seed the shortlist from your watchlist. Guests get trending picks.'}</p>
          <button className="button primary mn-go" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Popcorn size={16} />} Open the room</button>
        </form>

        <form className="mn-card glass" onSubmit={join}>
          <h2><LogIn size={18} /> Join a room</h2>
          <label className="mn-field"><span>Room code</span>
            <input className="mn-code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={10} placeholder="e.g. K7QF2M" autoCapitalize="characters" autoComplete="off" />
          </label>
          <button className="button secondary mn-go"><ArrowRight size={16} /> Join</button>
          {recent.length > 0 && (
            <div className="mn-recent"><span>Your recent rooms</span>{recent.map((c) => <button key={c} type="button" className="tn-chip" onClick={() => onEnter(c)}>{c}</button>)}</div>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Join prompt for someone who opened an invite link ───────────────────────

function JoinPrompt({ room, onJoined }: { room: Room; onJoined: (r: Room) => void }) {
  const { user, toast } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await roomApi<{ room: Room; token: string }>(`/${room.code}/join`, 'POST', null, { name: name || undefined });
      saveToken(room.code, res.token);
      onJoined(res.room);
    } catch (err) { toast((err as Error).message); } finally { setBusy(false); }
  };
  const host = room.members.find((m) => m.isHost)?.name ?? 'Your host';
  return (
    <form className="mn-join glass" onSubmit={join}>
      <span className="mn-join-icon"><Popcorn size={26} /></span>
      <h2>{host} invited you to <em>{room.name}</em></h2>
      <p>{room.members.length} {room.members.length === 1 ? 'person is' : 'people are'} here · {room.candidates.length} films on the shortlist</p>
      {!user && <label className="mn-field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="What should friends call you?" autoFocus /></label>}
      <button className="button primary mn-go" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />} Join the room</button>
      {!user && <small>Signed-in members add films from their watchlist automatically.</small>}
    </form>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function Members({ room }: { room: Room }) {
  return (
    <ul className="mn-members" aria-label="People in this room">
      {room.members.map((m) => (
        <li key={m.id} title={`${m.name}${m.isHost ? ' (host)' : ''}${m.voted ? ' · voted' : ''}`}>
          <span className="mn-avatar" style={{ background: m.color }}>{m.name.slice(0, 1).toUpperCase()}{m.isHost && <Crown size={11} className="mn-crown" />}{m.voted && <Check size={11} className="mn-voted" />}</span>
          <small>{m.id === room.you?.id ? 'You' : m.name}</small>
        </li>
      ))}
    </ul>
  );
}

function Poster({ c, className = '' }: { c: Pick<Candidate, 'poster' | 'title'>; className?: string }) {
  return c.poster ? <img className={`mn-poster ${className}`} src={c.poster} alt="" loading="lazy" /> : <span className={`mn-poster mn-poster-ph ${className}`}><Film size={22} /></span>;
}

function sourceLabel(c: Candidate): string {
  if (c.source === 'pitch') return `Pitched by ${c.addedBy ?? 'a friend'}`;
  if (c.source === 'watchlist') return `From ${c.addedBy ?? 'a'}’s watchlist`;
  return 'Trending now';
}

// ─── Lobby ───────────────────────────────────────────────────────────────────

function Lobby({ room, act }: { room: Room; act: (a: string, b?: Record<string, unknown>) => Promise<Room | null> }) {
  const { toast, openTitle } = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Title[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState('');
  const you = room.you!;

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      setSearching(true);
      // The catalog API's search parameter is "query": it searches every film and series, not just trending.
      api<{ items: Title[] }>(`/catalog?media=all&collection=trending&page=1&query=${encodeURIComponent(term)}`, 'GET', undefined, controller.signal)
        .then((r) => setResults(r.items.filter((x) => x.source === 'demo' || (x.releaseDate && x.releaseDate <= new Date().toISOString().slice(0, 10))).slice(0, 8)))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => { controller.abort(); window.clearTimeout(t); };
  }, [q]);

  const run = async (key: string, a: string, b?: Record<string, unknown>, ok?: string) => {
    setBusy(key);
    try { await act(a, b); if (ok) toast(ok); } catch (e) { toast((e as Error).message); } finally { setBusy(''); }
  };

  return (
    <div className="mn-stage">
      <div className="mn-stage-head">
        <h3>The shortlist <span>{room.candidates.length}/16</span></h3>
        <p>{you.isHost ? 'Search any film or series to add it, trim the rest, then start the vote.' : `Search any film or series to pitch it (${you.pitchesLeft} left) while the host gets everyone in.`}</p>
      </div>

      {you.pitchesLeft > 0 && room.candidates.length < 16 && (
        <div className="mn-pitch">
          <label className="mn-search"><Search size={16} aria-hidden="true" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search any film or series to add (${you.pitchesLeft} left)…`} aria-label="Search for a film or series to add" />{searching && <LoaderCircle size={15} className="spin" />}</label>
          {results.length > 0 && (
            <ul className="mn-results">
              {results.map((t) => (
                <li key={t.id}>
                  <button type="button" disabled={busy === t.id || room.candidates.some((c) => c.id === t.id)} onClick={() => { setQ(''); setResults([]); void run(t.id, 'pitch', { titleId: t.id }, `Pitched ${t.title}.`); }}>
                    {t.poster ? <img src={t.poster} alt="" /> : <span className="mn-results-ph" />}
                    <span><b>{t.title}</b><small>{[t.releaseDate?.slice(0, 4), t.runtime ? `${t.runtime} min` : null].filter(Boolean).join(' · ')}</small></span>
                    <Plus size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="mn-grid">
        {room.candidates.map((c, i) => (
          <li key={c.id} className="mn-cand" style={{ '--i': i } as React.CSSProperties}>
            <button type="button" className="mn-cand-open" onClick={() => openTitle(c.id)} aria-label={`Details for ${c.title}`}><Poster c={c} /></button>
            <b>{c.title}</b>
            <small>{[c.releaseDate?.slice(0, 4), c.runtime ? `${c.runtime} min` : null, c.genres[0]].filter(Boolean).join(' · ')}</small>
            <span className={`mn-src mn-src-${c.source}`}>{sourceLabel(c)}</span>
            {c.freeOn.length > 0 && <span className="mn-free-badge">Free on {c.freeOn[0]}</span>}
            {(you.isHost || (c.source !== 'trending' && c.addedBy === room.members.find((m) => m.id === you.id)?.name)) && (
              <button type="button" className="mn-remove" disabled={busy === `rm-${c.id}`} onClick={() => void run(`rm-${c.id}`, 'remove', { titleId: c.id })} aria-label={`Remove ${c.title}`}><Trash2 size={14} /></button>
            )}
          </li>
        ))}
      </ul>

      {you.isHost ? (
        <button type="button" className="button primary mn-cta" disabled={room.candidates.length < 2 || busy === 'start'} onClick={() => void run('start', 'start-voting')}>
          {busy === 'start' ? <LoaderCircle size={16} className="spin" /> : <ThumbsUp size={16} />} Start voting with {room.members.length} {room.members.length === 1 ? 'person' : 'people'}
        </button>
      ) : (
        <p className="mn-waiting"><LoaderCircle size={15} className="spin" /> Waiting for the host to start the vote…</p>
      )}
    </div>
  );
}

// ─── Voting: one card at a time, swipe or tap ────────────────────────────────

function Voting({ room, act }: { room: Room; act: (a: string, b?: Record<string, unknown>) => Promise<Room | null> }) {
  const { toast } = useApp();
  const you = room.you!;
  const [local, setLocal] = useState<Record<string, Choice>>(you.votes as Record<string, Choice>);
  const [drag, setDrag] = useState<{ x: number; dx: number } | null>(null);
  const [leaving, setLeaving] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = room.candidates.filter((c) => !local[c.id]);
  const current = pending[0];
  const votedCount = room.members.filter((m) => m.voted).length;

  const vote = useCallback(async (c: Candidate, choice: Choice) => {
    setLeaving(choice);
    setLocal((v) => ({ ...v, [c.id]: choice }));
    window.setTimeout(() => setLeaving(null), 260);
    try { await act('vote', { titleId: c.id, choice }); } catch (e) {
      toast((e as Error).message);
      setLocal((v) => { const n = { ...v }; delete n[c.id]; return n; });
    }
  }, [act, toast]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); void vote(current, 'yes'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); void vote(current, 'no'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); void vote(current, 'maybe'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, vote]);

  const toggleVeto = async (id: string) => {
    try { await act('veto', { titleId: you.veto === id ? null : id }); toast(you.veto === id ? 'Veto withdrawn.' : 'Vetoed. That film is out unless everything gets vetoed.'); } catch (e) { toast((e as Error).message); }
  };

  return (
    <div className="mn-stage">
      <div className="mn-stage-head">
        <h3>{current ? 'Would you watch this tonight?' : 'Your votes are in'}</h3>
        <p>{votedCount} of {room.members.length} finished voting{current ? ` · ${room.candidates.length - pending.length + 1} of ${room.candidates.length}` : ''}</p>
      </div>

      {current ? (
        <div className="mn-swipe">
          <article
            key={current.id}
            className={`mn-swipe-card ${leaving ? `is-${leaving}` : ''}`}
            style={drag ? { transform: `translateX(${drag.dx}px) rotate(${drag.dx / 18}deg)` } : undefined}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag({ x: e.clientX, dx: 0 }); }}
            onPointerMove={(e) => { if (drag) setDrag({ ...drag, dx: e.clientX - drag.x }); }}
            onPointerUp={() => { const dx = drag?.dx ?? 0; setDrag(null); if (dx > 90) void vote(current, 'yes'); else if (dx < -90) void vote(current, 'no'); }}
            onPointerCancel={() => setDrag(null)}
          >
            {drag && Math.abs(drag.dx) > 30 && <span className={`mn-stamp ${drag.dx > 0 ? 'is-yes' : 'is-no'}`}>{drag.dx > 0 ? 'YES' : 'NOPE'}</span>}
            <Poster c={current} className="mn-swipe-poster" />
            <div className="mn-swipe-info">
              <h4>{current.title}</h4>
              <p className="mn-swipe-meta">{[current.releaseDate?.slice(0, 4), current.runtime ? `${current.runtime} min` : null, current.genres.slice(0, 2).join(' · '), current.voteAverage ? `★ ${current.voteAverage.toFixed(1)}` : null].filter(Boolean).join(' · ')}</p>
              {current.overview && <p className="mn-swipe-overview">{current.overview}</p>}
              <span className={`mn-src mn-src-${current.source}`}>{sourceLabel(current)}</span>
              {current.freeOn.length > 0 && <span className="mn-free-badge">Free on {current.freeOn.join(', ')}</span>}
            </div>
          </article>
          <div className="mn-vote-buttons">
            <button type="button" className="mn-vote is-no" onClick={() => void vote(current, 'no')} aria-label="No"><ThumbsDown size={22} /><span>No</span></button>
            <button type="button" className="mn-vote is-maybe" onClick={() => void vote(current, 'maybe')} aria-label="Maybe"><HelpCircle size={22} /><span>Maybe</span></button>
            <button type="button" className="mn-vote is-yes" onClick={() => void vote(current, 'yes')} aria-label="Yes"><ThumbsUp size={22} /><span>Yes</span></button>
          </div>
          <p className="mn-keys">Swipe, tap, or use ← ↑ →</p>
        </div>
      ) : (
        <>
          <ul className="mn-myvotes">
            {room.candidates.map((c) => (
              <li key={c.id} className={you.veto === c.id ? 'is-vetoed' : ''}>
                <Poster c={c} />
                <span className="mn-myvotes-title"><b>{c.title}</b><small>{c.runtime ? `${c.runtime} min` : ''}</small></span>
                <div className="mn-seg" role="group" aria-label={`Your vote for ${c.title}`}>
                  {(['no', 'maybe', 'yes'] as Choice[]).map((ch) => (
                    <button key={ch} type="button" className={local[c.id] === ch ? `is-on is-${ch}` : ''} aria-pressed={local[c.id] === ch} onClick={() => void vote(c, ch)}>
                      {ch === 'yes' ? <ThumbsUp size={14} /> : ch === 'no' ? <ThumbsDown size={14} /> : <HelpCircle size={14} />}
                    </button>
                  ))}
                </div>
                <button type="button" className={`mn-veto ${you.veto === c.id ? 'is-on' : ''}`} onClick={() => void toggleVeto(c.id)} disabled={Boolean(you.veto) && you.veto !== c.id} aria-pressed={you.veto === c.id} title="One veto per person: this film is out">
                  <Ban size={14} /> {you.veto === c.id ? 'Vetoed' : 'Veto'}
                </button>
              </li>
            ))}
          </ul>
          {you.isHost ? (
            <button type="button" className="button primary mn-cta" disabled={busy} onClick={async () => {
              if (votedCount < room.members.length && !window.confirm(`${room.members.length - votedCount} still voting. Reveal anyway?`)) return;
              setBusy(true);
              try { await act('reveal'); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
            }}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Trophy size={16} />} Reveal the winner
            </button>
          ) : <p className="mn-waiting"><LoaderCircle size={15} className="spin" /> Waiting for the others, then the host reveals the winner…</p>}
        </>
      )}
    </div>
  );
}

// ─── Reveal ──────────────────────────────────────────────────────────────────

function WhereToWatch({ watch }: { watch: NonNullable<Room['result']>['watch'] }) {
  if (!watch) return null;
  return (
    <div className="mn-watch">
      <span className="mn-watch-head"><Tv size={15} /> Where to watch</span>
      {watch.youtubeId && <p className="mn-watch-group"><PlayCircle size={15} /> Free on YouTube — the watch party plays it right here, in sync</p>}
      {watch.groupServices.length > 0 && <p className="mn-watch-group"><PlayCircle size={15} /> On your group’s {watch.groupServices.join(' & ')}</p>}
      {watch.direct && watch.direct.length > 0 && (
        <div className="mn-direct">
          {watch.direct.map((d) => (
            <a key={`${d.name}-${d.type}`} className={`mn-direct-link is-${d.type}`} href={d.url} target="_blank" rel="noopener noreferrer">
              <Play size={14} /> {d.type === 'free' ? `Watch free on ${d.name}` : d.type === 'sub' ? `Watch on ${d.name}` : `${d.type === 'rent' ? 'Rent' : 'Buy'} on ${d.name}`}
            </a>
          ))}
        </div>
      )}
      {watch.providers.length ? (
        <div className="mn-providers">{watch.providers.map((p) => <span key={p.name} className="mn-provider">{p.logo && <img src={p.logo} alt="" />}{p.name}</span>)}</div>
      ) : <p className="mn-watch-none">No subscription service lists it in your region right now — it may be available to rent or buy.</p>}
      {watch.link && <a className="button secondary mn-watch-link" href={watch.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open the official watch options</a>}
      <small>Everyone watches on their own account. CinePulse keeps you in sync.</small>
    </div>
  );
}

function Reveal({ room, act }: { room: Room; act: (a: string, b?: Record<string, unknown>) => Promise<Room | null> }) {
  const { toast } = useApp();
  const [spinning, setSpinning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const result = room.result!;
  const byId = useMemo(() => new Map(room.candidates.map((c) => [c.id, c])), [room.candidates]);
  const winner = byId.get(result.winnerId)!;
  const top = Math.max(1, ...result.ranking.map((r) => r.score));
  useEffect(() => { const t = window.setTimeout(() => setSpinning(false), 2200); return () => window.clearTimeout(t); }, [result.decidedAt]);
  const winnerRef = useRef<HTMLDivElement>(null);
  const stopConfetti = useRef<(() => void) | null>(null);
  // Celebrate once the drumroll ends (a no-op with prefers-reduced-motion).
  useEffect(() => {
    if (spinning) return;
    const t = window.setTimeout(() => { stopConfetti.current = celebrate(winnerRef.current); }, 120);
    return () => { window.clearTimeout(t); stopConfetti.current?.(); };
  }, [spinning]);

  const schedule = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await act('party', body); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  if (spinning) {
    return (
      <div className="mn-drumroll" aria-live="polite">
        <div className="mn-reel">{[...room.candidates, ...room.candidates].map((c, i) => <Poster key={`${c.id}-${i}`} c={c} />)}</div>
        <p>And tonight’s film is…</p>
      </div>
    );
  }
  return (
    <div className="mn-stage">
      <div className="mn-winner pl-winner" ref={winnerRef}>
        <span className="pl-winner-glow" aria-hidden="true" />
        <Poster c={winner} className="mn-winner-poster" />
        <div className="mn-winner-info">
          <span className="eyebrow mint"><Trophy size={14} /> TONIGHT’S PICK</span>
          <h3>{winner.title}</h3>
          <p>{[winner.releaseDate?.slice(0, 4), winner.runtime ? `${winner.runtime} min` : null, winner.genres.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')}</p>
          <WhereToWatch watch={result.watch} />
        </div>
      </div>
      <Handoff room={room} act={act} />

      <ol className="mn-ranking">
        {result.ranking.map((r, i) => {
          const c = byId.get(r.titleId);
          if (!c) return null;
          return (
            <li key={r.titleId} className={r.titleId === result.winnerId ? 'is-winner' : ''}>
              <span className="mn-rank">{i + 1}</span>
              <span className="mn-rank-title"><b>{c.title}</b><small>{r.yes} yes · {r.maybe} maybe · {r.no} no{r.vetoed ? ' · vetoed' : ''}</small></span>
              <span className="mn-bar"><i style={{ width: `${(r.score / top) * 100}%` }} /></span>
              <b className="mn-score">{r.score}</b>
            </li>
          );
        })}
      </ol>

      {room.you?.isHost ? (
        <div className="mn-schedule glass">
          <h4><Play size={16} /> Start the watch party</h4>
          <p>Everyone gets a synced countdown and presses play together.</p>
          <div className="mn-chips">
            {[[60, 'In 1 minute'], [300, 'In 5 minutes'], [900, 'In 15 minutes'], [1800, 'In 30 minutes']].map(([s, l]) => (
              <button key={s} type="button" className="tn-chip" disabled={busy} onClick={() => void schedule({ startInSeconds: s })}>{l as string}</button>
            ))}
          </div>
          <form className="mn-custom" onSubmit={(e) => { e.preventDefault(); if (!custom) return; const [h, m] = custom.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); void schedule({ startAt: d.toISOString() }); }}>
            <label><span>Or at</span><input type="time" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Start time" /></label>
            <button className="button secondary" disabled={busy || !custom}>Schedule</button>
          </form>
        </div>
      ) : <p className="mn-waiting"><LoaderCircle size={15} className="spin" /> The host is picking a start time…</p>}
    </div>
  );
}

// ─── Watch party ─────────────────────────────────────────────────────────────

/** Same service for everyone? Point to its own watch party, and let the host share the invite. */
function Handoff({ room, act }: { room: Room; act: (a: string, b?: Record<string, unknown>) => Promise<Room | null> }) {
  const { toast } = useApp();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const isHost = room.you?.isHost;
  const subs = (room.result?.watch?.direct ?? []).filter((d) => d.type === 'sub').map((d) => d.name);
  if (!room.handoff && !isHost) return null;
  const share = async (value: string | null) => {
    setBusy(true);
    try { await act('handoff', { url: value }); if (value) { setUrl(''); toast('Invite shared with the room.'); } } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mn-handoff glass">
      <span className="mn-watch-head"><Users size={15} /> One shared player</span>
      {room.handoff ? (
        <>
          <p><b>{room.handoff.setBy ?? 'The host'}</b> started a {room.handoff.label} watch party.</p>
          <a className="button primary mn-handoff-join" href={room.handoff.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Join the {room.handoff.label} party</a>
          {isHost && <button type="button" className="text-link muted" onClick={() => void share(null)} disabled={busy}>Remove invite</button>}
        </>
      ) : (
        <>
          <p>{subs.length ? `Everyone on ${subs[0]}?` : 'Everyone on the same service?'} Use its own watch party — <a href="https://www.teleparty.com/" target="_blank" rel="noopener noreferrer">Teleparty</a> (Netflix, Prime Video, Disney+, Max, Hulu, YouTube) or Prime Video Watch Party — then paste the invite here so the whole room can join.</p>
          <form className="mn-handoff-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void share(url.trim()); }}>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.teleparty.com/join/…" aria-label="Watch party invite link" />
            <button className="button secondary" disabled={busy || !url.trim()}>Share</button>
          </form>
        </>
      )}
    </div>
  );
}

/**
 * Plays an official free YouTube upload inside the room, kept in step with the party clock:
 * play/pause follow the room, and the player is nudged back if it drifts more than 2.5 s.
 */
function SyncedYouTube({ videoId, state, elapsedMs }: { videoId: string; state: string; elapsedMs: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [joined, setJoined] = useState(false);
  const playerTime = useRef<number | null>(null);
  const target = useRef(0);
  target.current = elapsedMs / 1000;

  const send = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com');
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube-nocookie.com' || typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        if (msg?.event === 'infoDelivery' && typeof msg.info?.currentTime === 'number') playerTime.current = msg.info.currentTime;
      } catch { /* not a player message */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Follow the room: play when the party plays, pause otherwise.
  useEffect(() => {
    if (!joined) return;
    send('seekTo', [target.current, true]);
    send(state === 'playing' ? 'playVideo' : 'pauseVideo');
  }, [joined, state, send]);

  // Drift correction while playing.
  useEffect(() => {
    if (!joined || state !== 'playing') return;
    const id = window.setInterval(() => {
      const at = playerTime.current;
      if (at !== null && Math.abs(at - target.current) > 2.5) send('seekTo', [target.current, true]);
    }, 4000);
    return () => window.clearInterval(id);
  }, [joined, state, send]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="mn-player">
      <iframe
        ref={frame}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`}
        title="Watch party player"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), 'https://www.youtube-nocookie.com')}
      />
      {!joined && (
        <button type="button" className="mn-player-join" onClick={() => { setJoined(true); send('mute'); send('seekTo', [target.current, true]); send(state === 'playing' ? 'playVideo' : 'pauseVideo'); window.setTimeout(() => send('unMute'), 400); }}>
          <Play size={20} /> Watch here, in sync with the room
        </button>
      )}
      <small>Official free upload on YouTube · plays and pauses with the room</small>
    </div>
  );
}

function useNow(offset: number, active: boolean) {
  const [t, setT] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const tick = () => { const n = Date.now() + offset; if (n - last > 200) { last = n; setT(n); } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [offset, active]);
  return t;
}

function Party({ room, act, offset }: { room: Room; act: (a: string, b?: Record<string, unknown>) => Promise<Room | null>; offset: number }) {
  const { toast, user, updateLibrary } = useApp();
  const party = room.party!;
  const winner = room.candidates.find((c) => c.id === party.titleId)!;
  const ended = room.phase === 'ended';
  const now = useNow(offset, !ended);
  const [bursts, setBursts] = useState<Array<{ id: string; emoji: string; x: number }>>([]);
  const seen = useRef<Set<string>>(new Set());
  const firstFeed = useRef(true);

  // Live clock from the shared schedule (same maths as the server).
  const since = Date.parse(party.runningSince);
  const state = party.state === 'finished' ? 'finished' : party.state === 'paused' ? 'paused' : now < since ? (party.elapsedMs > 0 ? 'resuming' : 'scheduled') : 'playing';
  const elapsed = state === 'playing' ? party.elapsedMs + (now - since) : party.elapsedMs;
  const countdown = since - now;

  // Floating reactions from everyone (only new ones; not the backlog on first load).
  useEffect(() => {
    const fresh = room.feed.filter((f) => f.kind === 'reaction' && !seen.current.has(f.id));
    fresh.forEach((f) => seen.current.add(f.id));
    if (firstFeed.current) { firstFeed.current = false; return; }
    if (!fresh.length) return;
    setBursts((b) => [...b, ...fresh.map((f) => ({ id: f.id, emoji: f.emoji!, x: 10 + Math.random() * 80 }))].slice(-24));
  }, [room.feed]);

  const control = async (a: string) => { try { await act(a); } catch (e) { toast((e as Error).message); } };
  const react = async (emoji: string) => {
    const id = `me-${Date.now()}`;
    setBursts((b) => [...b, { id, emoji, x: 10 + Math.random() * 80 }].slice(-24));
    try { const r = await act('react', { emoji }); r?.feed.forEach((f) => seen.current.add(f.id)); } catch (e) { toast((e as Error).message); }
  };

  const total = (winner.runtime ?? 0) * 60_000;
  return (
    <div className="mn-stage mn-party">
      <div className="mn-party-screen" style={winner.backdrop ? { backgroundImage: `linear-gradient(180deg, rgba(8,11,14,.55), rgba(8,11,14,.95)), url(${winner.backdrop})` } : undefined}>
        <div className="mn-bursts" aria-hidden="true">{bursts.map((b) => <span key={b.id} style={{ left: `${b.x}%` }} onAnimationEnd={() => setBursts((list) => list.filter((x) => x.id !== b.id))}>{b.emoji}</span>)}</div>
        <span className="eyebrow mint"><Popcorn size={14} /> WATCH PARTY · {winner.title.toUpperCase()}</span>
        {state === 'scheduled' && (
          <>
            <p className="mn-party-label">Everyone press play in</p>
            <div className="mn-countdown" aria-live="polite">{countdown > 10_000 ? fmtClock(countdown) : Math.max(0, Math.ceil(countdown / 1000))}</div>
            <p className="mn-party-sub">Open {winner.title} on your service and pause it at the very start.{countdown > 60_000 ? ` Starts at ${new Date(since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ''}</p>
          </>
        )}
        {state === 'resuming' && (<><p className="mn-party-label">Resume in</p><div className="mn-countdown">{Math.max(0, Math.ceil(countdown / 1000))}</div><p className="mn-party-sub">Get your finger on play…</p></>)}
        {state === 'playing' && (
          <>
            <p className="mn-party-label is-live"><span className="mn-live-dot" /> {elapsed < 6000 ? 'PRESS PLAY NOW!' : 'Playing together'}</p>
            <div className="mn-elapsed">{fmtClock(elapsed)}{total ? <small> / {fmtClock(total)}</small> : null}</div>
            {total > 0 && <div className="mn-progress"><i style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} /></div>}
            <p className="mn-party-sub">If you drift, scrub your player to {fmtClock(elapsed)}.</p>
          </>
        )}
        {state === 'paused' && (<><p className="mn-party-label is-paused"><Pause size={16} /> Paused by {party.pausedBy ?? 'someone'}</p><div className="mn-elapsed">{fmtClock(elapsed)}</div><p className="mn-party-sub">Pause your player at {fmtClock(elapsed)}. Anyone can resume with a shared 5-second countdown.</p></>)}
        {state === 'finished' && (<><p className="mn-party-label"><Star size={16} /> That’s a wrap</p><div className="mn-elapsed">{fmtClock(elapsed)}</div><p className="mn-party-sub">Thanks for watching together.</p></>)}

        {!ended && room.result?.watch?.direct?.[0] && (state === 'scheduled' || state === 'resuming') && (
          <a className="button primary mn-open-service" href={room.result.watch.direct[0].url} target="_blank" rel="noopener noreferrer">
            <Play size={16} /> Open it on {room.result.watch.direct[0].name}
          </a>
        )}
        {!ended && (
          <div className="mn-party-controls">
            {state === 'playing' && <button type="button" className="button secondary" onClick={() => void control('pause')}><Pause size={16} /> Ask everyone to pause</button>}
            {state === 'paused' && <button type="button" className="button primary" onClick={() => void control('resume')}><Play size={16} /> Resume together</button>}
            {state === 'scheduled' && room.you?.isHost && countdown > 8000 && <button type="button" className="button secondary" onClick={() => void control('start-now')}><Play size={16} /> Start now</button>}
            {room.you?.isHost && state !== 'scheduled' && <button type="button" className="button secondary" onClick={() => { if (window.confirm('End the watch party for everyone?')) void control('end'); }}><X size={16} /> End party</button>}
          </div>
        )}
      </div>

      {!ended && room.result?.watch?.youtubeId && (
        <SyncedYouTube videoId={room.result.watch.youtubeId} state={state} elapsedMs={elapsed} />
      )}
      {!ended && <Handoff room={room} act={act} />}

      {!ended && (
        <div className="mn-reactions" role="group" aria-label="Send a reaction">
          {REACTIONS.map((e) => <button key={e} type="button" onClick={() => void react(e)} aria-label={`React ${e}`}>{e}</button>)}
        </div>
      )}

      <div className="mn-party-grid">
        <WhereToWatch watch={room.result?.watch ?? null} />
        <div className="mn-feed glass">
          <span className="mn-watch-head"><Users size={15} /> In the room</span>
          <ul>
            {room.feed.slice(-8).reverse().map((f) => (
              <li key={f.id}><b>{f.name ?? 'Someone'}</b> {f.kind === 'reaction' ? <span className="mn-feed-emoji">{f.emoji}</span> : f.text}</li>
            ))}
          </ul>
        </div>
      </div>

      {ended && user && (
        <div className="mn-after glass">
          <h4><Clapperboard size={16} /> Log it to your library</h4>
          <p>Mark {winner.title} as watched (you can rate it in the title page).</p>
          <button type="button" className="button primary" onClick={() => void updateLibrary(winner as unknown as Title, 'watched')}><Check size={16} /> Mark as watched</button>
        </div>
      )}
    </div>
  );
}

// ─── Room shell ──────────────────────────────────────────────────────────────

function RoomView({ code, onLeave }: { code: string; onLeave: () => void }) {
  const { toast } = useApp();
  const { room, error, offset, act, apply, refresh } = useRoom(code);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/?view=movie-night&room=${code}` : '';

  const share = async () => {
    const text = `Join my CinePulse movie night "${room?.name ?? ''}" — we’re picking a film together. Code ${code}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: 'CinePulse Movie Night', text, url: link }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(link); toast('Invite link copied.'); } catch { toast(link); }
  };

  if (error && !room) {
    return (
      <div className="mn-error glass"><Popcorn size={26} /><h3>Can’t open room {code}</h3><p>{error}</p><button type="button" className="button secondary" onClick={onLeave}>Back to Movie Night</button></div>
    );
  }
  if (!room) return <div className="mn-error"><LoaderCircle size={24} className="spin" /> Opening the room…</div>;
  if (!room.you) return <JoinPrompt room={room} onJoined={(r) => { apply(r); void refresh(true); }} />;

  const stepIndex = STEPS.findIndex((s) => s.id === (room.phase === 'ended' ? 'party' : room.phase));
  return (
    <div className="mn-room">
      <header className="mn-room-head">
        <div>
          <span className="eyebrow mint"><Popcorn size={14} /> MOVIE NIGHT</span>
          <h2>{room.name}</h2>
          {(room.settings.maxRuntime || room.settings.mood || room.settings.freeOnly) && <p className="mn-room-meta">{[room.settings.freeOnly ? 'Free tonight' : null, room.settings.maxRuntime ? `Up to ${room.settings.maxRuntime} min` : null, room.settings.mood].filter(Boolean).join(' · ')}</p>}
          {room.settings.freeFallback && <p className="mn-room-note">Not enough films are free to stream in your region right now, so the shortlist includes paid ones too. Look for the “Free on…” badges.</p>}
        </div>
        <div className="mn-invite">
          <button type="button" className="mn-code" onClick={() => { void navigator.clipboard?.writeText(code).then(() => toast('Room code copied.')).catch(() => {}); }} title="Copy the room code"><Copy size={14} /> {code}</button>
          <button type="button" className="button primary small" onClick={() => void share()}><Share2 size={15} /> Invite</button>
        </div>
      </header>
      <ol className="mn-steps" aria-label="Movie night progress">
        {STEPS.map((s, i) => <li key={s.id} className={i < stepIndex ? 'is-done' : i === stepIndex ? 'is-active' : ''} aria-current={i === stepIndex ? 'step' : undefined}>{i < stepIndex ? <Check size={12} /> : <span>{i + 1}</span>} {s.label}</li>)}
      </ol>
      <Members room={room} />
      {room.phase === 'lobby' && <Lobby room={room} act={act} />}
      {room.phase === 'voting' && <Voting room={room} act={act} />}
      {room.phase === 'reveal' && <Reveal room={room} act={act} />}
      {(room.phase === 'party' || room.phase === 'ended') && <Party room={room} act={act} offset={offset} />}
      <button type="button" className="text-link muted mn-leave" onClick={onLeave}><Link2 size={13} /> Leave this screen (the room stays open)</button>
    </div>
  );
}

export function MovieNightView() {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('room');
    if (fromUrl && /^[A-Z0-9]{4,10}$/i.test(fromUrl)) setCode(fromUrl.toUpperCase());
  }, []);
  const enter = (c: string) => { setCode(c); setRoomInUrl(c); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const leave = () => { setCode(null); setRoomInUrl(null); };
  return <section className="section space-page mn">{code ? <RoomView key={code} code={code} onLeave={leave} /> : <Landing onEnter={enter} />}</section>;
}

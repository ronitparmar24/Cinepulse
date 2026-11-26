/**
 * Movie Night rooms: pick a film together, then watch it in sync.
 *
 * Phases: lobby (join, pitch films) → voting (Yes / Maybe / No on every candidate, one veto each)
 * → reveal (scores, winner, where to watch) → party (a shared countdown so everyone presses play
 * on their own legal service at the same moment, with pause/resume requests and reactions)
 * → ended.
 *
 * Anyone with the link can join, signed in or not. Joining returns a private token that is the
 * only way to act as that member; only its hash is stored. Room state is one JSON document with a
 * version number: every change is an optimistic compare-and-swap, so simultaneous votes from
 * different phones never overwrite each other.
 */
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { db, now } from './db';
import { bad, forbidden, notFound } from './errors';
import { isReleased } from './eligibility';
import { cleanServiceIds, matchServices, servicesForRegion } from './services';
import type { Title, User, WatchProviderInfo } from './types';

export type Phase = 'lobby' | 'voting' | 'reveal' | 'party' | 'ended';
export type Choice = 'yes' | 'maybe' | 'no';
export const REACTIONS = ['🍿', '😂', '😱', '😭', '🔥', '👏', '❤️', '🤯'] as const;
export const LIMITS = { members: 12, candidates: 10, pitchesPerMember: 2, feed: 60, nameLength: 40, roomName: 60 };
const COLORS = ['#b3f3d5', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#34d399', '#fb923c', '#f87171', '#22d3ee', '#facc15', '#c084fc', '#4ade80'];

export interface TitleLite {
  id: string; title: string; poster: string | null; backdrop: string | null; releaseDate: string | null;
  runtime: number | null; genres: string[]; mediaType: string; voteAverage: number | null; overview: string;
}
interface Member {
  id: string; name: string; userId: string | null; tokenHash: string; color: string;
  joinedAt: string; services: string[]; pitches: number;
}
interface Candidate { title: TitleLite; source: 'watchlist' | 'trending' | 'pitch'; addedBy: string | null }
interface ResultRow { titleId: string; score: number; yes: number; maybe: number; no: number; vetoed: boolean }
interface WatchInfo { link: string | null; providers: Array<{ name: string; logo: string }>; groupServices: string[] }
interface Party {
  titleId: string;
  startAt: string;
  state: 'scheduled' | 'playing' | 'paused' | 'finished';
  /** Milliseconds watched before the latest pause/resume. */
  elapsedMs: number;
  /** When playback (re)started: startAt at first, then each resume's countdown end. */
  runningSince: string;
  pausedBy: string | null;
}
interface FeedItem { id: string; memberId: string | null; kind: 'reaction' | 'join' | 'pitch' | 'system'; emoji?: string; text?: string; at: string }
interface RoomData {
  name: string;
  hostMemberId: string;
  phase: Phase;
  settings: { maxRuntime: number | null; mood: string | null; region: 'IN' | 'US' };
  members: Member[];
  candidates: Candidate[];
  votes: Record<string, Record<string, Choice>>;
  vetoes: Record<string, string>;
  result: { winnerId: string; ranking: ResultRow[]; decidedAt: string; watch: WatchInfo | null } | null;
  party: Party | null;
  feed: FeedItem[];
}

export interface RoomDeps {
  loadTitle: (id: string) => Promise<Title>;
  trending: () => Promise<Title[]>;
  watchlist: (userId: string) => Promise<Title[]>;
  services: (userId: string, region: string) => Promise<string[]>;
  providers: (id: string, region: string) => Promise<WatchProviderInfo>;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(24).toString('base64url');

function lite(t: Title): TitleLite {
  return {
    id: t.id, title: t.title, poster: t.poster ?? null, backdrop: t.backdrop ?? null, releaseDate: t.releaseDate ?? null,
    runtime: typeof t.runtime === 'number' ? t.runtime : null, genres: Array.isArray(t.genres) ? t.genres.slice(0, 4) : [],
    mediaType: t.mediaType, voteAverage: typeof t.voteAverage === 'number' ? t.voteAverage : null, overview: String(t.overview || '').slice(0, 280),
  };
}

function cleanName(value: unknown, fallback: string, max = LIMITS.nameLength): string {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  return s || fallback;
}

function code(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[randomInt(0, chars.length)]).join('');
}

/** You can only watch what is out. Fictional demo titles count as watchable so demo mode works. */
const watchable = (t: Title) => t.source === 'demo' || isReleased(t.releaseDate);

function fits(t: Title, settings: RoomData['settings']): boolean {
  if (!watchable(t)) return false;
  if (settings.maxRuntime && typeof t.runtime === 'number' && t.runtime > settings.maxRuntime + 5) return false;
  if (settings.mood && !(t.genres || []).includes(settings.mood)) return false;
  return true;
}

function addCandidates(room: RoomData, titles: Title[], source: Candidate['source'], addedBy: string | null, max: number): number {
  let added = 0;
  for (const t of titles) {
    if (room.candidates.length >= LIMITS.candidates || added >= max) break;
    if (room.candidates.some((c) => c.title.id === t.id) || !fits(t, room.settings)) continue;
    room.candidates.push({ title: lite(t), source, addedBy });
    added++;
  }
  return added;
}

function pushFeed(room: RoomData, item: Omit<FeedItem, 'id' | 'at'>, at = now()): void {
  room.feed.push({ id: randomUUID().slice(0, 8), at, ...item });
  if (room.feed.length > LIMITS.feed) room.feed.splice(0, room.feed.length - LIMITS.feed);
}

// ─── Persistence with optimistic concurrency ─────────────────────────────────

interface Row { id: string; code: string; data: string; version: number; expires_at: string }

async function load(roomCode: string): Promise<{ row: Row; room: RoomData }> {
  const row = (await db().get('SELECT id, code, data, version, expires_at FROM movie_rooms WHERE code = ?', String(roomCode || '').toUpperCase())) as Row | undefined;
  if (!row) throw notFound('That movie night room doesn’t exist. Check the code.');
  if (Date.parse(row.expires_at) < Date.now()) throw bad('This movie night room has expired. Start a new one.');
  return { row, room: JSON.parse(row.data) as RoomData };
}

async function mutate<T>(roomCode: string, fn: (room: RoomData) => T | Promise<T>): Promise<{ room: RoomData; version: number; value: T }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { row, room } = await load(roomCode);
    const value = await fn(room);
    const next = Number(row.version) + 1;
    const extend = room.party ? new Date(Math.max(Date.parse(row.expires_at), Date.parse(room.party.startAt) + 8 * 3_600_000)).toISOString() : row.expires_at;
    const res = await db().run('UPDATE movie_rooms SET data = ?, version = ?, updated_at = ?, expires_at = ? WHERE id = ? AND version = ?',
      JSON.stringify(room), next, now(), extend, row.id, row.version);
    if (res.changes) return { room, version: next, value };
    await new Promise((r) => setTimeout(r, 10 + Math.random() * (20 + attempt * 30))); // someone else saved first: re-read and retry
  }
  throw bad('The room is busy right now. Please try again.');
}

function memberFor(room: RoomData, token: string | null | undefined): Member {
  const h = token ? hash(token) : '';
  const m = h ? room.members.find((x) => x.tokenHash === h) : undefined;
  if (!m) throw forbidden('Join this room first.');
  return m;
}
const requireHost = (room: RoomData, m: Member) => { if (room.hostMemberId !== m.id) throw forbidden('Only the host can do that.'); };
const requirePhase = (room: RoomData, ...phases: Phase[]) => { if (!phases.includes(room.phase)) throw bad('That isn’t possible at this stage of the movie night.'); };

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Yes = 2, Maybe = 1, No = 0. Vetoed films drop out unless everything was vetoed. Ties: more Yes, fewer No, then a fair coin per room. */
export function scoreRoom(candidates: string[], votes: Record<string, Record<string, Choice>>, vetoes: Record<string, string>, seed: string): ResultRow[] {
  const vetoed = new Set(Object.values(vetoes));
  const rows = candidates.map((id) => {
    let yes = 0, maybe = 0, no = 0;
    for (const v of Object.values(votes)) {
      if (v[id] === 'yes') yes++; else if (v[id] === 'maybe') maybe++; else if (v[id] === 'no') no++;
    }
    return { titleId: id, score: yes * 2 + maybe, yes, maybe, no, vetoed: vetoed.has(id) };
  });
  const coin = (id: string) => createHash('sha256').update(`${seed}:${id}`).digest().readUInt32BE(0);
  const allVetoed = rows.every((r) => r.vetoed);
  return rows.sort((a, b) =>
    (allVetoed ? 0 : Number(a.vetoed) - Number(b.vetoed)) || b.score - a.score || b.yes - a.yes || a.no - b.no || coin(a.titleId) - coin(b.titleId));
}

/** Where the party currently is, from the shared schedule and the server clock. */
export function partyClock(party: Party | null, at = Date.now()): { state: Party['state']; elapsedMs: number; startsInMs: number } | null {
  if (!party) return null;
  if (party.state === 'finished' || party.state === 'paused') return { state: party.state, elapsedMs: party.elapsedMs, startsInMs: 0 };
  const since = Date.parse(party.runningSince);
  if (at < since) return { state: party.elapsedMs > 0 ? 'paused' : 'scheduled', elapsedMs: party.elapsedMs, startsInMs: since - at };
  return { state: 'playing', elapsedMs: party.elapsedMs + (at - since), startsInMs: 0 };
}

// ─── Public view ─────────────────────────────────────────────────────────────

export function publicRoom(roomCode: string, version: number, room: RoomData, token?: string | null) {
  const h = token ? hash(token) : '';
  const me = h ? room.members.find((m) => m.tokenHash === h) : undefined;
  const nameOf = (id: string | null) => room.members.find((m) => m.id === id)?.name ?? null;
  return {
    code: roomCode,
    version,
    name: room.name,
    phase: room.phase,
    settings: room.settings,
    serverNow: Date.now(),
    you: me ? { id: me.id, isHost: me.id === room.hostMemberId, votes: room.votes[me.id] ?? {}, veto: room.vetoes[me.id] ?? null, pitchesLeft: Math.max(0, LIMITS.pitchesPerMember - me.pitches), signedIn: Boolean(me.userId) } : null,
    members: room.members.map((m) => ({
      id: m.id, name: m.name, color: m.color, isHost: m.id === room.hostMemberId, signedIn: Boolean(m.userId),
      voted: room.phase !== 'lobby' && room.candidates.length > 0 && room.candidates.every((c) => room.votes[m.id]?.[c.title.id]),
    })),
    candidates: room.candidates.map((c) => ({ ...c.title, source: c.source, addedBy: nameOf(c.addedBy) })),
    // Individual votes stay private; only totals are revealed, and only at the reveal.
    result: room.result,
    party: room.party ? { ...room.party, pausedBy: nameOf(room.party.pausedBy), clock: partyClock(room.party) } : null,
    feed: room.feed.slice(-30).map((f) => ({ ...f, name: nameOf(f.memberId) })),
  };
}
export type PublicRoom = ReturnType<typeof publicRoom>;

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createRoom(user: User | null, input: unknown, deps: RoomDeps): Promise<{ room: PublicRoom; token: string }> {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const maxRuntime = Number(b.maxRuntime);
  const region = String(user?.region || b.region || 'IN').toUpperCase() === 'US' ? 'US' : 'IN';
  const settings: RoomData['settings'] = {
    maxRuntime: Number.isFinite(maxRuntime) && maxRuntime >= 60 && maxRuntime <= 300 ? Math.round(maxRuntime) : null,
    mood: typeof b.mood === 'string' && b.mood.trim() && b.mood.length <= 40 ? b.mood.trim() : null,
    region,
  };
  const token = newToken();
  const hostId = `m_${randomUUID().slice(0, 8)}`;
  const services = user ? await deps.services(user.id, region).catch(() => []) : [];
  const room: RoomData = {
    name: cleanName(b.name, 'Movie Night', LIMITS.roomName),
    hostMemberId: hostId,
    phase: 'lobby',
    settings,
    members: [{ id: hostId, name: cleanName(b.yourName ?? user?.displayName ?? user?.name, 'Host'), userId: user?.id ?? null, tokenHash: hash(token), color: COLORS[0], joinedAt: now(), services, pitches: 0 }],
    candidates: [],
    votes: {},
    vetoes: {},
    result: null,
    party: null,
    feed: [],
  };
  if (user) addCandidates(room, await deps.watchlist(user.id).catch(() => []), 'watchlist', hostId, 3);
  addCandidates(room, await deps.trending().catch(() => []), 'trending', null, 6 - room.candidates.length);
  pushFeed(room, { memberId: hostId, kind: 'system', text: 'opened the room' });

  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = code();
    const stamp = now();
    try {
      await db().run('INSERT INTO movie_rooms (id, code, host_user_id, data, version, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        `room_${randomUUID()}`, roomCode, user?.id ?? null, JSON.stringify(room), stamp, stamp, new Date(Date.now() + 24 * 3_600_000).toISOString());
      return { room: publicRoom(roomCode, 1, room, token), token };
    } catch (e) {
      if (!/unique|duplicate/i.test(String((e as Error).message))) throw e; // code clash: try another code
    }
  }
  throw bad('Could not open a room right now. Please try again.');
}

export async function getRoom(roomCode: string, token?: string | null, knownVersion?: number | null): Promise<PublicRoom | { unchanged: true; version: number; serverNow: number }> {
  if (knownVersion) {
    const v = (await db().get('SELECT version, expires_at FROM movie_rooms WHERE code = ?', String(roomCode).toUpperCase())) as { version: number; expires_at: string } | undefined;
    if (v && Number(v.version) === Number(knownVersion) && Date.parse(v.expires_at) > Date.now()) return { unchanged: true, version: Number(v.version), serverNow: Date.now() };
  }
  const { row, room } = await load(roomCode);
  return publicRoom(row.code, Number(row.version), room, token);
}

export async function joinRoom(roomCode: string, user: User | null, input: unknown, deps: RoomDeps): Promise<{ room: PublicRoom; token: string }> {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const token = newToken();
  // Look up services and watchlist before the transaction so retries stay quick.
  const region = (await load(roomCode)).room.settings.region;
  const services = user ? await deps.services(user.id, region).catch(() => []) : [];
  const watchlist = user ? await deps.watchlist(user.id).catch(() => []) : [];
  const { room, version } = await mutate(roomCode, (r) => {
    if (r.phase === 'ended') throw bad('This movie night has ended.');
    const existing = user ? r.members.find((m) => m.userId === user.id) : undefined;
    if (existing) {
      existing.tokenHash = hash(token); // same account on a new device: take over the seat
      existing.services = services;
      return;
    }
    if (r.members.length >= LIMITS.members) throw bad('This room is full.');
    const id = `m_${randomUUID().slice(0, 8)}`;
    const name = cleanName(b.name ?? user?.displayName ?? user?.name, `Guest ${r.members.length + 1}`);
    r.members.push({ id, name, userId: user?.id ?? null, tokenHash: hash(token), color: COLORS[r.members.length % COLORS.length], joinedAt: now(), services, pitches: 0 });
    pushFeed(r, { memberId: id, kind: 'join', text: 'joined' });
    if (r.phase === 'lobby' && watchlist.length) addCandidates(r, watchlist, 'watchlist', id, 2);
  });
  return { room: publicRoom(roomCode.toUpperCase(), version, room, token), token };
}

export async function roomAction(roomCode: string, token: string | null, action: string, input: unknown, deps: RoomDeps): Promise<PublicRoom> {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const titleId = typeof b.titleId === 'string' ? b.titleId : '';

  // Work that needs the network happens outside the compare-and-swap.
  let pitched: Title | null = null;
  if (action === 'pitch') {
    if (!titleId) throw bad('Choose a film to pitch');
    pitched = await deps.loadTitle(titleId);
    if (!watchable(pitched)) throw bad(`${pitched.title} isn’t out yet, so you can’t watch it tonight.`);
  }
  let watch: WatchInfo | null = null;
  let watchFor: string | null = null;
  if (action === 'reveal') {
    const { room: r } = await load(roomCode);
    const m = memberFor(r, token);
    requireHost(r, m);
    requirePhase(r, 'voting');
    const ranking = scoreRoom(r.candidates.map((c) => c.title.id), r.votes, r.vetoes, roomCode);
    const winner = ranking[0]?.titleId;
    watchFor = winner ?? null;
    if (winner) {
      const info = await deps.providers(winner, r.settings.region).catch(() => null);
      const memberServices = [...new Set(r.members.flatMap((x) => x.services))];
      watch = {
        link: info?.link ?? null,
        providers: (info?.flatrate ?? []).slice(0, 6).map((p) => ({ name: p.providerName, logo: p.logoPath })),
        groupServices: matchServices(info, cleanServiceIds(memberServices, r.settings.region), r.settings.region),
      };
    }
  }

  const { room, version } = await mutate(roomCode, (r) => {
    const m = memberFor(r, token);
    switch (action) {
      case 'pitch': {
        requirePhase(r, 'lobby');
        if (m.pitches >= LIMITS.pitchesPerMember) throw bad(`You can pitch up to ${LIMITS.pitchesPerMember} films.`);
        if (r.candidates.length >= LIMITS.candidates) throw bad('The shortlist is full.');
        if (r.candidates.some((c) => c.title.id === pitched!.id)) throw bad('That film is already on the shortlist.');
        r.candidates.push({ title: lite(pitched!), source: 'pitch', addedBy: m.id });
        m.pitches++;
        pushFeed(r, { memberId: m.id, kind: 'pitch', text: `pitched ${pitched!.title}` });
        return;
      }
      case 'remove': {
        requirePhase(r, 'lobby');
        const c = r.candidates.find((x) => x.title.id === titleId);
        if (!c) throw notFound('That film isn’t on the shortlist.');
        if (r.hostMemberId !== m.id && c.addedBy !== m.id) throw forbidden('Only the host or whoever added it can remove a film.');
        r.candidates = r.candidates.filter((x) => x !== c);
        return;
      }
      case 'start-voting': {
        requireHost(r, m);
        requirePhase(r, 'lobby');
        if (r.candidates.length < 2) throw bad('Add at least two films before voting.');
        r.phase = 'voting';
        pushFeed(r, { memberId: m.id, kind: 'system', text: 'started the vote' });
        return;
      }
      case 'vote': {
        requirePhase(r, 'voting');
        const choice = b.choice;
        if (choice !== 'yes' && choice !== 'maybe' && choice !== 'no') throw bad('Vote yes, maybe or no');
        if (!r.candidates.some((c) => c.title.id === titleId)) throw bad('That film isn’t on the shortlist.');
        r.votes[m.id] = { ...(r.votes[m.id] ?? {}), [titleId]: choice };
        return;
      }
      case 'veto': {
        requirePhase(r, 'voting');
        if (!titleId) { delete r.vetoes[m.id]; return; }
        if (!r.candidates.some((c) => c.title.id === titleId)) throw bad('That film isn’t on the shortlist.');
        r.vetoes[m.id] = titleId;
        return;
      }
      case 'reveal': {
        requireHost(r, m);
        requirePhase(r, 'voting');
        if (!Object.keys(r.votes).length) throw bad('Wait for at least one vote.');
        const ranking = scoreRoom(r.candidates.map((c) => c.title.id), r.votes, r.vetoes, roomCode);
        // A late vote can change the winner after "where to watch" was looked up; never show the wrong one.
        r.result = { winnerId: ranking[0].titleId, ranking, decidedAt: now(), watch: ranking[0].titleId === watchFor ? watch : null };
        r.phase = 'reveal';
        pushFeed(r, { memberId: m.id, kind: 'system', text: 'revealed the winner' });
        return;
      }
      case 'party': {
        requireHost(r, m);
        requirePhase(r, 'reveal', 'party');
        const inSeconds = Number(b.startInSeconds);
        const at = typeof b.startAt === 'string' ? Date.parse(b.startAt) : NaN;
        const startMs = Number.isFinite(at) ? at : Date.now() + (Number.isFinite(inSeconds) ? inSeconds : 60) * 1000;
        if (startMs < Date.now() + 5_000 - 1_000 || startMs > Date.now() + 12 * 3_600_000) throw bad('Pick a start time between 5 seconds and 12 hours from now.');
        const startAt = new Date(startMs).toISOString();
        r.party = { titleId: r.result!.winnerId, startAt, runningSince: startAt, state: 'scheduled', elapsedMs: 0, pausedBy: null };
        r.phase = 'party';
        pushFeed(r, { memberId: m.id, kind: 'system', text: 'scheduled the watch party' });
        return;
      }
      case 'pause':
      case 'resume': {
        requirePhase(r, 'party');
        const p = r.party!;
        const clock = partyClock(p)!;
        if (action === 'pause') {
          if (clock.state !== 'playing') throw bad('The film isn’t playing yet.');
          p.elapsedMs = clock.elapsedMs;
          p.state = 'paused';
          p.pausedBy = m.id;
          pushFeed(r, { memberId: m.id, kind: 'system', text: 'asked everyone to pause' });
        } else {
          if (p.state !== 'paused') throw bad('Nothing is paused.');
          p.runningSince = new Date(Date.now() + 5_000).toISOString(); // a shared 5-second countdown
          p.state = 'playing';
          p.pausedBy = null;
          pushFeed(r, { memberId: m.id, kind: 'system', text: 'resumed — play in 5 seconds' });
        }
        return;
      }
      case 'start-now': {
        requireHost(r, m);
        requirePhase(r, 'party');
        const p = r.party!;
        if (partyClock(p)!.state !== 'scheduled') throw bad('The party has already started.');
        p.startAt = p.runningSince = new Date(Date.now() + 5_000).toISOString();
        return;
      }
      case 'end': {
        requireHost(r, m);
        requirePhase(r, 'party');
        const clock = partyClock(r.party)!;
        r.party!.elapsedMs = clock.elapsedMs;
        r.party!.state = 'finished';
        r.phase = 'ended';
        pushFeed(r, { memberId: m.id, kind: 'system', text: 'ended the party' });
        return;
      }
      case 'react': {
        const emoji = typeof b.emoji === 'string' ? b.emoji : '';
        if (!(REACTIONS as readonly string[]).includes(emoji)) throw bad('Unknown reaction');
        const last = [...r.feed].reverse().find((f) => f.memberId === m.id && f.kind === 'reaction');
        if (last && Date.now() - Date.parse(last.at) < 1200) throw bad('Easy there — one reaction at a time.');
        pushFeed(r, { memberId: m.id, kind: 'reaction', emoji });
        return;
      }
      default:
        throw notFound('Unknown action');
    }
  });
  return publicRoom(roomCode.toUpperCase(), version, room, token);
}

/** Services offered in a region, for the room's "where to watch" hints. */
export function regionServiceNames(region: string): string[] {
  return servicesForRegion(region).map((s) => s.name);
}

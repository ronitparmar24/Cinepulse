import { randomUUID } from 'node:crypto';
import { db, now } from './db';
import { notFound, bad } from './errors';
import { allTitles } from './catalog';
import type { Title, User } from './types';
import { tallyBorda, tallyApproval, type TallyResult } from './voting';

export interface Participant {
  id: string;
  name: string;
  userId: string | null;
  joinedAt: string;
  voted: boolean;
}

export interface MovieNightVote {
  voterId: string;
  ranking?: string[];
  approvals?: string[];
  votedAt: string;
}

export interface MovieNightSession {
  id: string;
  sessionCode: string;
  hostUserId: string | null;
  hostName: string;
  title: string;
  method: 'borda' | 'approval';
  status: 'voting' | 'completed' | 'expired';
  genres: string[];
  maxRuntime: number | null;
  moodTags: string[];
  candidates: Title[];
  participants: Participant[];
  votes: MovieNightVote[];
  tally: TallyResult | null;
  winnerTitle: Title | null;
  createdAt: string;
  expiresAt: string;
}

function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createMovieNightSession(
  host: { id: string | null; name: string },
  options: {
    title?: string;
    method?: 'borda' | 'approval';
    genres?: string[];
    maxRuntime?: number;
    moodTags?: string[];
  } = {}
): Promise<MovieNightSession> {
  const d = db();
  const id = `mn_${randomUUID()}`;
  const sessionCode = generateSessionCode();

  const method = options.method === 'approval' ? 'approval' : 'borda';
  const genres = options.genres || [];
  const maxRuntime = options.maxRuntime || null;
  const moodTags = options.moodTags || [];

  // Pick candidates from catalog matching criteria or popular titles
  const all = await allTitles();
  let filtered = all.filter((t: Title) => {
    if (genres.length > 0 && !genres.some(g => t.genres.includes(g))) return false;
    if (maxRuntime && t.runtime && t.runtime > maxRuntime) return false;
    return true;
  });

  if (filtered.length < 5) {
    filtered = all.slice();
  }

  // Pick top 6 candidates (shuffle or take first 6)
  const candidates = filtered.slice(0, 6);

  const createdAt = now();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const hostParticipantId = `p_${randomUUID().slice(0, 8)}`;
  const participants: Participant[] = [
    {
      id: hostParticipantId,
      name: host.name || 'Host',
      userId: host.id,
      joinedAt: createdAt,
      voted: false
    }
  ];

  const session: MovieNightSession = {
    id,
    sessionCode,
    hostUserId: host.id,
    hostName: host.name || 'Host',
    title: options.title || 'Movie Night',
    method,
    status: 'voting',
    genres,
    maxRuntime,
    moodTags,
    candidates,
    participants,
    votes: [],
    tally: null,
    winnerTitle: null,
    createdAt,
    expiresAt
  };

  d.prepare(`
    INSERT INTO movie_night_sessions (id, host_user_id, session_code, state_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, host.id, sessionCode, JSON.stringify(session), createdAt, expiresAt);

  return session;
}

export function getMovieNightSession(sessionCodeOrId: string): MovieNightSession | null {
  const d = db();
  const row = d.prepare(`
    SELECT state_json, expires_at
    FROM movie_night_sessions
    WHERE session_code = ? OR id = ?
  `).get(sessionCodeOrId.toUpperCase(), sessionCodeOrId) as { state_json: string; expires_at: string } | undefined;

  if (!row) return null;

  const session = JSON.parse(row.state_json) as MovieNightSession;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    session.status = 'expired';
  }

  return session;
}

export function joinMovieNightSession(
  sessionCodeOrId: string,
  participantName: string,
  userId: string | null = null
): { session: MovieNightSession; participantId: string } {
  const session = getMovieNightSession(sessionCodeOrId);
  if (!session) throw notFound('Movie night session not found');
  if (session.status === 'expired') throw bad('This movie night session has expired');

  // If already joined with same userId, reuse participant
  if (userId) {
    const existing = session.participants.find(p => p.userId === userId);
    if (existing) {
      return { session, participantId: existing.id };
    }
  }

  const participantId = `p_${randomUUID().slice(0, 8)}`;
  session.participants.push({
    id: participantId,
    name: participantName || 'Guest',
    userId,
    joinedAt: now(),
    voted: false
  });

  saveSession(session);
  return { session, participantId };
}

export function submitMovieNightVote(
  sessionCodeOrId: string,
  voterId: string,
  vote: { ranking?: string[]; approvals?: string[] }
): MovieNightSession {
  const session = getMovieNightSession(sessionCodeOrId);
  if (!session) throw notFound('Movie night session not found');
  if (session.status !== 'voting') throw bad('Voting is closed for this session');

  const participant = session.participants.find(p => p.id === voterId);
  if (!participant) throw bad('Participant not registered in this session');

  // Upsert vote
  const existingIdx = session.votes.findIndex(v => v.voterId === voterId);
  const voteRecord: MovieNightVote = {
    voterId,
    ranking: vote.ranking,
    approvals: vote.approvals,
    votedAt: now()
  };

  if (existingIdx >= 0) {
    session.votes[existingIdx] = voteRecord;
  } else {
    session.votes.push(voteRecord);
  }

  participant.voted = true;

  // Auto calculate current tally
  updateSessionTally(session);
  saveSession(session);

  return session;
}

export function finalizeMovieNightSession(sessionCodeOrId: string): MovieNightSession {
  const session = getMovieNightSession(sessionCodeOrId);
  if (!session) throw notFound('Movie night session not found');

  updateSessionTally(session);
  session.status = 'completed';

  saveSession(session);
  return session;
}

function updateSessionTally(session: MovieNightSession) {
  const candidateIds = session.candidates.map(c => c.id);

  if (session.method === 'borda') {
    const bordaVotes = session.votes.map(v => ({
      voterId: v.voterId,
      ranking: v.ranking || []
    }));
    session.tally = tallyBorda(candidateIds, bordaVotes);
  } else {
    const approvalVotes = session.votes.map(v => ({
      voterId: v.voterId,
      approvals: v.approvals || []
    }));
    session.tally = tallyApproval(candidateIds, approvalVotes);
  }

  if (session.tally?.winner) {
    session.winnerTitle = session.candidates.find(c => c.id === session.tally!.winner) || null;
  }
}

function saveSession(session: MovieNightSession) {
  const d = db();
  d.prepare(`
    UPDATE movie_night_sessions
    SET state_json = ?
    WHERE id = ?
  `).run(JSON.stringify(session), session.id);
}

import { randomUUID } from 'node:crypto';
import { db, now } from './db';
import { notFound, bad, unauthorized } from './errors';
import { titleById } from './catalog';
import type { Title, User } from './types';
import { tallyBorda, type TallyResult } from './voting';

export interface CircleMember {
  userId: string;
  name: string;
  role: 'admin' | 'member';
  joinedAt: string;
  reviewsCount?: number;
  brierScore?: number | null;
}

export interface CircleWatchlistItem {
  id: string;
  circleId: string;
  title: Title;
  addedBy: string;
  addedAt: string;
}

export interface CircleWeeklyPick {
  id: string;
  circleId: string;
  weekOf: string;
  status: 'voting' | 'selected';
  candidates: Title[];
  votes: Array<{ userId: string; ranking: string[] }>;
  selectedTitle: Title | null;
  tally: TallyResult | null;
  createdAt: string;
}

export interface WatchCircle {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  memberCount?: number;
}

export interface WatchCircleDetails extends WatchCircle {
  members: CircleMember[];
  watchlist: CircleWatchlistItem[];
  currentPick: CircleWeeklyPick | null;
  pastPicks: CircleWeeklyPick[];
  leaderboard: Array<{ userId: string; name: string; reviewsCount: number; brierScore: number | null }>;
}

function generateInviteCode(): string {
  return 'CIRC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function createCircle(user: User, name: string, description: string = ''): WatchCircle {
  if (!name.trim()) throw bad('Circle name is required');
  const d = db();
  const id = `circle_${randomUUID()}`;
  const inviteCode = generateInviteCode();
  const createdAt = now();

  d.prepare(`
    INSERT INTO circles (id, name, owner_id, join_code, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), user.id, inviteCode, createdAt);

  d.prepare(`
    INSERT INTO circle_members (circle_id, user_id, role, joined_at)
    VALUES (?, ?, 'admin', ?)
  `).run(id, user.id, createdAt);

  return {
    id,
    name: name.trim(),
    description: description.trim(),
    inviteCode,
    createdBy: user.id,
    createdAt,
    memberCount: 1
  };
}

export function joinCircleByInvite(user: User, inviteCode: string): WatchCircle {
  const d = db();
  const circle = d.prepare(`
    SELECT id, name, owner_id, join_code, created_at
    FROM circles
    WHERE join_code = ?
  `).get(inviteCode.trim().toUpperCase()) as any;

  if (!circle) throw notFound('Invalid circle invite code');

  // Check if already a member
  const member = d.prepare(`
    SELECT role FROM circle_members WHERE circle_id = ? AND user_id = ?
  `).get(circle.id, user.id);

  if (!member) {
    d.prepare(`
      INSERT INTO circle_members (circle_id, user_id, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `).run(circle.id, user.id, now());
  }

  return {
    id: circle.id,
    name: circle.name,
    description: '',
    inviteCode: circle.join_code,
    createdBy: circle.owner_id,
    createdAt: circle.created_at
  };
}

export function listUserCircles(user: User): WatchCircle[] {
  const d = db();
  const rows = d.prepare(`
    SELECT c.id, c.name, c.join_code, c.owner_id, c.created_at,
           (SELECT COUNT(*) FROM circle_members m WHERE m.circle_id = c.id) as member_count
    FROM circles c
    JOIN circle_members cm ON cm.circle_id = c.id
    WHERE cm.user_id = ?
    ORDER BY c.created_at DESC
  `).all(user.id) as any[];

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: '',
    inviteCode: r.join_code,
    createdBy: r.owner_id,
    createdAt: r.created_at,
    memberCount: Number(r.member_count) || 1
  }));
}

export function getCircleDetails(circleId: string, user?: User | null): WatchCircleDetails {
  const d = db();
  const circle = d.prepare(`
    SELECT id, name, owner_id, join_code, created_at
    FROM circles
    WHERE id = ?
  `).get(circleId) as any;


  if (!circle) throw notFound('Circle not found');

  // Fetch members
  const memberRows = d.prepare(`
    SELECT cm.user_id, cm.role, cm.joined_at, u.name,
           (SELECT COUNT(*) FROM reviews r WHERE r.user_id = cm.user_id) as reviews_count
    FROM circle_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.circle_id = ?
    ORDER BY cm.joined_at ASC
  `).all(circleId) as any[];

  const members: CircleMember[] = memberRows.map(m => ({
    userId: m.user_id,
    name: m.name,
    role: m.role,
    joinedAt: m.joined_at,
    reviewsCount: Number(m.reviews_count) || 0,
    brierScore: null
  }));

  // Fetch watchlist
  const wlRows = d.prepare(`
    SELECT circle_id, title_id, added_by, added_at
    FROM circle_watchlist
    WHERE circle_id = ?
    ORDER BY added_at DESC
  `).all(circleId) as any[];

  const watchlist: CircleWatchlistItem[] = wlRows.map(w => ({
    id: `${w.circle_id}_${w.title_id}`,
    circleId: w.circle_id,
    title: {
      id: w.title_id,
      source: 'demo',
      mediaType: 'movie',
      title: w.title_id.replace(/^demo-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      overview: '',
      tagline: '',
      poster: '',
      backdrop: null,
      releaseDate: '2026-01-01',
      releaseDateSource: 'fictional-demo-date',
      releaseDateRegion: null,
      genres: ['Drama'],
      runtime: 120,
      seasons: null,
      status: 'released',
      voteAverage: null,
      voteCount: 0,
      popularity: null,
      cast: [],
      trailerKey: null,
      director: null,
      budget: null,
      revenue: null
    },
    addedBy: w.added_by,
    addedAt: w.added_at
  }));

  // Fetch picks
  const pickRows = d.prepare(`
    SELECT id, circle_id, title_id, week_of, candidates_json, votes_json, decided_at
    FROM circle_picks
    WHERE circle_id = ?
    ORDER BY week_of DESC
  `).all(circleId) as any[];

  const parsedPicks: CircleWeeklyPick[] = pickRows.map(p => {
    const candidates: Title[] = p.candidates_json ? JSON.parse(p.candidates_json) : [];
    const votes: Array<{ userId: string; ranking: string[] }> = p.votes_json ? JSON.parse(p.votes_json) : [];
    const candidateIds = candidates.map(c => c.id);
    const bordaVotes = votes.map(v => ({ voterId: v.userId, ranking: v.ranking }));
    const tally = candidates.length > 0 ? tallyBorda(candidateIds, bordaVotes) : null;
    const selectedTitle = candidates.find(c => c.id === p.title_id) || null;

    return {
      id: p.id,
      circleId: p.circle_id,
      weekOf: p.week_of,
      status: p.decided_at ? 'selected' : 'voting',
      candidates,
      votes,
      selectedTitle,
      tally,
      createdAt: p.week_of
    };
  });

  const currentPick = parsedPicks.find(p => p.status === 'voting') || parsedPicks[0] || null;
  const pastPicks = parsedPicks.filter(p => p.id !== currentPick?.id);

  // Leaderboard: rank members by reviews count
  const leaderboard = [...members]
    .sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0))
    .map(m => ({
      userId: m.userId,
      name: m.name,
      reviewsCount: m.reviewsCount || 0,
      brierScore: null
    }));

  return {
    id: circle.id,
    name: circle.name,
    description: '',
    inviteCode: circle.join_code,
    createdBy: circle.owner_id,
    createdAt: circle.created_at,
    memberCount: members.length,
    members,
    watchlist,
    currentPick,
    pastPicks,
    leaderboard
  };
}

export async function addCircleWatchlist(user: User, circleId: string, titleId: string): Promise<void> {
  const d = db();
  const isMember = d.prepare('SELECT 1 FROM circle_members WHERE circle_id = ? AND user_id = ?').get(circleId, user.id);
  if (!isMember) throw unauthorized('You are not a member of this circle');

  d.prepare(`
    INSERT INTO circle_watchlist (circle_id, title_id, added_by, added_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(circle_id, title_id) DO UPDATE SET added_at = excluded.added_at
  `).run(circleId, titleId, user.id, now());
}

export function removeCircleWatchlist(user: User, circleId: string, titleId: string): void {
  const d = db();
  const isMember = d.prepare('SELECT 1 FROM circle_members WHERE circle_id = ? AND user_id = ?').get(circleId, user.id);
  if (!isMember) throw unauthorized('You are not a member of this circle');

  d.prepare('DELETE FROM circle_watchlist WHERE circle_id = ? AND title_id = ?').run(circleId, titleId);
}

export async function createWeeklyVoteSession(
  user: User,
  circleId: string,
  candidateTitleIds: string[],
  weekOf: string
): Promise<CircleWeeklyPick> {
  const d = db();
  const member = d.prepare('SELECT role FROM circle_members WHERE circle_id = ? AND user_id = ?').get(circleId, user.id) as { role: string } | undefined;
  if (!member) throw unauthorized('You are not a member of this circle');

  const candidates: Title[] = [];
  for (const tid of candidateTitleIds) {
    try {
      candidates.push(await titleById(tid));
    } catch {
      candidates.push({
        id: tid,
        source: 'demo',
        mediaType: 'movie',
        title: tid,
        overview: '',
        tagline: '',
        poster: '',
        backdrop: null,
        releaseDate: '2026-01-01',
        releaseDateSource: 'fictional-demo-date',
        releaseDateRegion: null,
        genres: ['Action'],
        runtime: 120,
        seasons: null,
        status: 'released',
        voteAverage: null,
        voteCount: 0,
        popularity: null,
        cast: [],
        trailerKey: null,
        director: null,
        budget: null,
        revenue: null
      });
    }
  }

  if (candidates.length < 2) throw bad('Provide at least 2 candidate titles for weekly voting');

  const id = `cp_${randomUUID().slice(0, 8)}`;

  d.prepare(`
    INSERT INTO circle_picks (id, circle_id, week_of, title_id, candidates_json, votes_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, circleId, weekOf, candidates[0].id, JSON.stringify(candidates), JSON.stringify([]));

  return {
    id,
    circleId,
    weekOf,
    status: 'voting',
    candidates,
    votes: [],
    selectedTitle: null,
    tally: null,
    createdAt: weekOf
  };
}

export function castCircleVote(
  user: User,
  circleId: string,
  pickId: string,
  ranking: string[]
): CircleWeeklyPick {
  const d = db();
  const member = d.prepare('SELECT 1 FROM circle_members WHERE circle_id = ? AND user_id = ?').get(circleId, user.id);
  if (!member) throw unauthorized('You are not a member of this circle');

  const row = d.prepare('SELECT id, circle_id, week_of, title_id, candidates_json, votes_json, decided_at FROM circle_picks WHERE id = ? AND circle_id = ?').get(pickId, circleId) as any;
  if (!row) throw notFound('Weekly pick session not found');

  const candidates: Title[] = JSON.parse(row.candidates_json || '[]');
  const votes: Array<{ userId: string; ranking: string[] }> = JSON.parse(row.votes_json || '[]');

  const existingIdx = votes.findIndex(v => v.userId === user.id);
  if (existingIdx >= 0) {
    votes[existingIdx].ranking = ranking;
  } else {
    votes.push({ userId: user.id, ranking });
  }

  // Tally using shared Borda
  const candidateIds = candidates.map(c => c.id);
  const bordaVotes = votes.map(v => ({ voterId: v.userId, ranking: v.ranking }));
  const tally = tallyBorda(candidateIds, bordaVotes);

  let selectedTitle: Title | null = null;
  if (tally.winner) {
    selectedTitle = candidates.find(c => c.id === tally.winner) || null;
  }

  d.prepare(`
    UPDATE circle_picks
    SET votes_json = ?, title_id = ?
    WHERE id = ?
  `).run(
    JSON.stringify(votes),
    selectedTitle ? selectedTitle.id : '',
    pickId
  );

  return {
    id: row.id,
    circleId: row.circle_id,
    weekOf: row.week_of,
    status: row.decided_at ? 'selected' : 'voting',
    candidates,
    votes,
    selectedTitle,
    tally,
    createdAt: row.week_of
  };
}


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
    INSERT INTO circles (id, name, description, invite_code, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), description.trim(), inviteCode, user.id, createdAt);

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
    SELECT id, name, description, invite_code, created_by, created_at
    FROM circles
    WHERE invite_code = ?
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
    description: circle.description,
    inviteCode: circle.invite_code,
    createdBy: circle.created_by,
    createdAt: circle.created_at
  };
}

export function listUserCircles(user: User): WatchCircle[] {
  const d = db();
  const rows = d.prepare(`
    SELECT c.id, c.name, c.description, c.invite_code, c.created_by, c.created_at,
           (SELECT COUNT(*) FROM circle_members m WHERE m.circle_id = c.id) as member_count
    FROM circles c
    JOIN circle_members cm ON cm.circle_id = c.id
    WHERE cm.user_id = ?
    ORDER BY c.created_at DESC
  `).all(user.id) as any[];

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    inviteCode: r.invite_code,
    createdBy: r.created_by,
    createdAt: r.created_at,
    memberCount: Number(r.member_count) || 1
  }));
}

export function getCircleDetails(circleId: string, user?: User | null): WatchCircleDetails {
  const d = db();
  const circle = d.prepare(`
    SELECT id, name, description, invite_code, created_by, created_at
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
    SELECT id, circle_id, title_id, title_json, added_by, added_at
    FROM circle_watchlist
    WHERE circle_id = ?
    ORDER BY added_at DESC
  `).all(circleId) as any[];

  const watchlist: CircleWatchlistItem[] = wlRows.map(w => ({
    id: w.id,
    circleId: w.circle_id,
    title: typeof w.title_json === 'string' ? JSON.parse(w.title_json) : w.title_json,
    addedBy: w.added_by,
    addedAt: w.added_at
  }));

  // Fetch picks
  const pickRows = d.prepare(`
    SELECT id, circle_id, title_id, title_json, week_of, status, voting_data_json, created_at
    FROM circle_picks
    WHERE circle_id = ?
    ORDER BY week_of DESC
  `).all(circleId) as any[];

  const parsedPicks: CircleWeeklyPick[] = pickRows.map(p => {
    const vData = p.voting_data_json ? JSON.parse(p.voting_data_json) : {};
    return {
      id: p.id,
      circleId: p.circle_id,
      weekOf: p.week_of,
      status: p.status,
      candidates: vData.candidates || [],
      votes: vData.votes || [],
      selectedTitle: typeof p.title_json === 'string' ? JSON.parse(p.title_json) : p.title_json,
      tally: vData.tally || null,
      createdAt: p.created_at
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
    description: circle.description,
    inviteCode: circle.invite_code,
    createdBy: circle.created_by,
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

  const title = await titleById(titleId);
  const id = `cw_${randomUUID().slice(0, 8)}`;

  d.prepare(`
    INSERT INTO circle_watchlist (id, circle_id, title_id, title_json, added_by, added_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(circle_id, title_id) DO UPDATE SET added_at = excluded.added_at
  `).run(id, circleId, title.id, JSON.stringify(title), user.id, now());
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
    } catch {}
  }

  if (candidates.length < 2) throw bad('Provide at least 2 candidate titles for weekly voting');

  const id = `cp_${randomUUID().slice(0, 8)}`;
  const createdAt = now();
  const votingData = {
    candidates,
    votes: [],
    tally: null
  };

  d.prepare(`
    INSERT INTO circle_picks (id, circle_id, title_id, title_json, week_of, status, voting_data_json, created_at)
    VALUES (?, ?, ?, ?, ?, 'voting', ?, ?)
  `).run(id, circleId, candidates[0].id, JSON.stringify(candidates[0]), weekOf, JSON.stringify(votingData), createdAt);

  return {
    id,
    circleId,
    weekOf,
    status: 'voting',
    candidates,
    votes: [],
    selectedTitle: null,
    tally: null,
    createdAt
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

  const row = d.prepare('SELECT id, circle_id, week_of, status, voting_data_json, created_at FROM circle_picks WHERE id = ? AND circle_id = ?').get(pickId, circleId) as any;
  if (!row) throw notFound('Weekly pick session not found');
  if (row.status !== 'voting') throw bad('Voting has already concluded for this week');

  const vData = JSON.parse(row.voting_data_json || '{}');
  const votes: Array<{ userId: string; ranking: string[] }> = vData.votes || [];

  const existingIdx = votes.findIndex(v => v.userId === user.id);
  if (existingIdx >= 0) {
    votes[existingIdx].ranking = ranking;
  } else {
    votes.push({ userId: user.id, ranking });
  }

  // Tally using shared Borda
  const candidateIds = (vData.candidates as Title[]).map(c => c.id);
  const bordaVotes = votes.map(v => ({ voterId: v.userId, ranking: v.ranking }));
  const tally = tallyBorda(candidateIds, bordaVotes);

  vData.votes = votes;
  vData.tally = tally;

  let selectedTitle: Title | null = null;
  if (tally.winner) {
    selectedTitle = (vData.candidates as Title[]).find(c => c.id === tally.winner) || null;
  }

  d.prepare(`
    UPDATE circle_picks
    SET voting_data_json = ?, title_id = ?, title_json = ?
    WHERE id = ?
  `).run(
    JSON.stringify(vData),
    selectedTitle ? selectedTitle.id : '',
    selectedTitle ? JSON.stringify(selectedTitle) : '',
    pickId
  );

  return {
    id: row.id,
    circleId: row.circle_id,
    weekOf: row.week_of,
    status: row.status,
    candidates: vData.candidates,
    votes: vData.votes,
    selectedTitle,
    tally,
    createdAt: row.created_at
  };
}

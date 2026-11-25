/**
 * Community reports and moderation.
 *
 * Any signed-in member can report a review or comment once. When three different members have
 * reported the same item it is hidden automatically until a moderator looks at it. Moderators
 * (ADMIN_EMAILS) see open reports grouped by item and can hide, restore or dismiss them.
 * Hidden items disappear from feeds, title pages, profiles and comment threads.
 */
import { randomUUID } from 'node:crypto';
import { db, now } from './db';
import { bad, forbidden, notFound } from './errors';

export const REPORT_REASONS = ['spoilers', 'harassment', 'spam', 'off_topic', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTarget = 'review' | 'comment';
export const AUTO_HIDE_AT = 3;

const TABLE: Record<ReportTarget, string> = { review: 'reviews', comment: 'comments' };

function parseTarget(value: unknown): ReportTarget {
  if (value === 'review' || value === 'comment') return value;
  throw bad('Only reviews and comments can be reported');
}

async function ownerOf(type: ReportTarget, id: string): Promise<{ userId: string; hiddenAt: string | null } | null> {
  const row = (await db().get(`SELECT user_id, hidden_at FROM ${TABLE[type]} WHERE id = ?`, id)) as { user_id?: string; hidden_at?: string | null } | undefined;
  return row?.user_id ? { userId: String(row.user_id), hiddenAt: row.hidden_at ?? null } : null;
}

export async function reportContent(reporterId: string, input: unknown): Promise<{ ok: true; hidden: boolean; alreadyReported: boolean }> {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const type = parseTarget(body.targetType);
  const id = typeof body.targetId === 'string' && body.targetId.length <= 120 ? body.targetId : '';
  if (!id) throw bad('targetId is required');
  const reason = REPORT_REASONS.includes(body.reason as ReportReason) ? (body.reason as ReportReason) : null;
  if (!reason) throw bad('Choose a reason for the report');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

  const owner = await ownerOf(type, id);
  if (!owner) throw notFound('That post no longer exists');
  if (owner.userId === reporterId) throw bad('You can’t report your own post');

  const res = await db().run(
    `INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(reporter_id, target_type, target_id) DO NOTHING`,
    randomUUID(), reporterId, type, id, reason, note || null, now(),
  );
  const alreadyReported = !res.changes;

  const open = Number(((await db().get(
    'SELECT COUNT(DISTINCT reporter_id) AS n FROM content_reports WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL', type, id,
  )) as { n?: number } | undefined)?.n || 0);
  let hidden = Boolean(owner.hiddenAt);
  if (!hidden && open >= AUTO_HIDE_AT) {
    await db().run(`UPDATE ${TABLE[type]} SET hidden_at = ? WHERE id = ? AND hidden_at IS NULL`, now(), id);
    hidden = true;
  }
  return { ok: true, hidden, alreadyReported };
}

export interface ReportGroup {
  targetType: ReportTarget;
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

/** Open reports grouped by item, most-reported first. */
export async function listOpenReports(limit = 50): Promise<ReportGroup[]> {
  const rows = (await db().all(
    `SELECT target_type, target_id, reason, note, created_at FROM content_reports WHERE resolved_at IS NULL ORDER BY created_at ASC LIMIT 1000`,
  )) as any[];
  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const key = `${r.target_type}:${r.target_id}`;
    const g: ReportGroup = groups.get(key) ?? { targetType: r.target_type, targetId: String(r.target_id), hidden: false, author: null, excerpt: '', titleName: null, reports: 0, reasons: {}, notes: [], firstReportedAt: String(r.created_at) };
    g.reports++;
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    if (r.note && g.notes.length < 5) g.notes.push(String(r.note));
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => b.reports - a.reports || a.firstReportedAt.localeCompare(b.firstReportedAt)).slice(0, limit);
  for (const g of list) {
    const row = g.targetType === 'review'
      ? (await db().get('SELECT r.body, r.title_name, r.hidden_at, u.id AS uid, COALESCE(u.display_name, u.name) AS uname FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?', g.targetId)) as any
      : (await db().get('SELECT c.body, NULL AS title_name, c.hidden_at, u.id AS uid, COALESCE(u.display_name, u.name) AS uname FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?', g.targetId)) as any;
    if (row) {
      g.excerpt = String(row.body || '').slice(0, 280);
      g.titleName = row.title_name ? String(row.title_name) : null;
      g.hidden = Boolean(row.hidden_at);
      g.author = { id: String(row.uid), name: String(row.uname || 'Member') };
    } else {
      g.excerpt = '(deleted by its author)';
    }
  }
  return list;
}

export async function resolveReports(moderatorEmail: string, input: unknown): Promise<{ ok: true; hidden: boolean }> {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const type = parseTarget(body.targetType);
  const id = typeof body.targetId === 'string' ? body.targetId : '';
  const action = body.action;
  if (action !== 'hide' && action !== 'restore' && action !== 'dismiss') throw bad('action must be hide, restore or dismiss');
  if (!id) throw bad('targetId is required');
  if (!moderatorEmail) throw forbidden('Moderator access required');
  const stamp = now();
  if (action === 'hide') await db().run(`UPDATE ${TABLE[type]} SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?`, stamp, id);
  if (action === 'restore' || action === 'dismiss') await db().run(`UPDATE ${TABLE[type]} SET hidden_at = NULL WHERE id = ?`, id);
  await db().run(
    'UPDATE content_reports SET resolved_at = ?, resolution = ? WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL',
    stamp, `${action} by ${moderatorEmail}`, type, id,
  );
  return { ok: true, hidden: action === 'hide' };
}

/**
 * One-time import of data the old code wrote to Supabase's `public` tables
 * (profiles, library, reviews, forecasts, forecast_events) into the CinePulse schema.
 *
 *   DATABASE_URL=postgres://…supabase… npm run db:import-supabase
 *
 * - Users keep signing in through Supabase Auth exactly as before: imported users get the
 *   same id and the `oauth:supabase:<id>` marker that sign-in already uses.
 * - Safe to re-run: existing rows are skipped (ON CONFLICT DO NOTHING).
 * - Read-only on the source tables. SOURCE_SCHEMA overrides "public" (used by tests).
 */
import { isPostgresUrl, normalizeDatabaseUrl } from '../../lib/dbUrl';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { migratePostgres } from '../../lib/db/drivers';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

async function main() {
  const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (!url || !isPostgresUrl(url)) throw new Error('Set DATABASE_URL to your Supabase Postgres connection string.');
  const target = process.env.DATABASE_SCHEMA || 'cinepulse';
  const source = process.env.SOURCE_SCHEMA || 'public';
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migratePostgres(sql as never, target, resolve(process.cwd(), 'migrations', 'pg'));
    const counts: Record<string, number> = {};
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO ${target}`);
      // Runs on the transaction's connection (the pool has only one).
      const has = async (t: string) =>
        (await tx.unsafe(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [source, t])).length > 0;

      if (await has('profiles')) {
        const profiles = await tx.unsafe(
          `SELECT id, name, email, username, display_name, bio, avatar_url, profile_visibility, created_at FROM ${source}.profiles`,
        );
        let n = 0;
        for (const p of profiles) {
          const id = String(p.id);
          let username =
            (p.username ? String(p.username) : String(p.email).split('@')[0])
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, '')
              .slice(0, 20) || `user_${id.slice(0, 6)}`;
          if ((await tx.unsafe(`SELECT 1 FROM users WHERE username = $1 AND id <> $2`, [username, id])).length)
            username = `${username.slice(0, 13)}_${id.slice(0, 6)}`;
          const r = await tx.unsafe(
            `INSERT INTO users (id, name, email, password_hash, created_at, username, display_name, bio, avatar_url, profile_visibility)
             VALUES ($1, $2, lower($3), $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
            [
              id,
              String(p.name || username),
              String(p.email),
              `oauth:supabase:${id}`,
              iso(p.created_at),
              username,
              p.display_name ?? p.name ?? username,
              p.bio ?? null,
              p.avatar_url ?? null,
              p.profile_visibility ?? 'public',
            ],
          );
          await tx.unsafe(`INSERT INTO privacy_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
          n += r.count ?? 0;
        }
        counts.users = n;
      }

      const copy = async (table: string, select: string, insert: string, map: (r: Record<string, unknown>) => unknown[]) => {
        if (!(await has(table))) return;
        const rows = await tx.unsafe(`SELECT ${select} FROM ${source}.${table}`);
        let n = 0;
        for (const r of rows) {
          // Skip rows whose user is not in the CinePulse schema (FK would fail).
          if (!(await tx.unsafe(`SELECT 1 FROM users WHERE id = $1`, [String(r.user_id)])).length) continue;
          n += (await tx.unsafe(`${insert} ON CONFLICT DO NOTHING`, map(r) as never[])).count ?? 0;
        }
        counts[table] = n;
      };

      await copy(
        'library',
        'user_id, title_id, title_json, status, rating, updated_at',
        `INSERT INTO library (user_id, title_id, title_json, status, rating, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        (r) => [String(r.user_id), r.title_id, JSON.stringify(r.title_json), r.status, r.rating, iso(r.updated_at)],
      );
      await copy(
        'reviews',
        'id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at',
        `INSERT INTO reviews (id, user_id, title_id, title_name, body, rating, spoiler, kind, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        (r) => [String(r.id), String(r.user_id), r.title_id, r.title_name, r.body, r.rating, r.spoiler ? 1 : 0, r.kind, iso(r.created_at)],
      );
      await copy(
        'forecasts',
        'user_id, title_id, choice, confidence, reason, title_json, created_at, updated_at',
        `INSERT INTO forecasts (user_id, title_id, choice, confidence, reason, title_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        (r) => [
          String(r.user_id),
          r.title_id,
          r.choice,
          r.confidence,
          r.reason,
          r.title_json == null ? null : JSON.stringify(r.title_json),
          iso(r.created_at),
          iso(r.updated_at),
        ],
      );
      await copy(
        'forecast_events',
        'id, user_id, title_id, choice, confidence, reason, first_submission, release_date, created_at',
        `INSERT INTO forecast_events (id, user_id, title_id, choice, confidence, reason, first_submission, release_date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        (r) => [
          String(r.id),
          String(r.user_id),
          r.title_id,
          r.choice,
          r.confidence,
          r.reason,
          r.first_submission ? 1 : 0,
          r.release_date,
          iso(r.created_at),
        ],
      );
    });
    console.log(`Imported into "${target}" from "${source}":`, counts);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error('Import failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

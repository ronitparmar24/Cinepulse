/**
 * Creates or upgrades the database schema, then exits.
 *   npm run db:migrate
 * SQLite (no DATABASE_URL): applies lib/db.ts migrations to DATABASE_PATH.
 * Postgres (DATABASE_URL=postgres://…): applies migrations/pg/*.sql to DATABASE_SCHEMA.
 * The app also does this automatically on first use; this command lets you do it ahead of a deploy.
 */
import { resolve } from 'node:path';
import postgres from 'postgres';
import { closeDb, db, usingPostgres, CURRENT_SCHEMA_VERSION } from '../../lib/db';
import { migratePostgres } from '../../lib/db/drivers';

async function main() {
  if (usingPostgres()) {
    const schema = process.env.DATABASE_SCHEMA || 'cinepulse';
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
    try {
      const applied = await migratePostgres(sql as never, schema, resolve(process.cwd(), 'migrations', 'pg'));
      console.log(applied.length ? `Applied to schema "${schema}": ${applied.join(', ')}` : `Schema "${schema}" is up to date.`);
    } finally {
      await sql.end({ timeout: 5 });
    }
  } else {
    await db().get('SELECT 1');
    console.log(`SQLite database at ${process.env.DATABASE_PATH || './data/cinepulse.db'} is at schema version ${CURRENT_SCHEMA_VERSION}.`);
  }
  await closeDb();
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

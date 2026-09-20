# Cinepulse local backup and restore

Cinepulse stores accounts, sessions, library entries, reviews, forecasts, forecast history, and its short-lived catalog cache in the local SQLite database configured by `DATABASE_PATH` (default: `./data/cinepulse.db`). This procedure is for the local student installation only.

## Before a backup

1. Stop the Cinepulse dev or production-style server. Do not copy only the main `.db` file while SQLite is running: WAL and shared-memory sidecars may contain committed data.
2. Keep `.env.local` and the database backup private. Never put either in Git or a source ZIP.
3. Copy the **entire directory containing the database**, including any `-wal` and `-shm` files:

```sh
# With DATABASE_PATH=./data/cinepulse.db
cp -a data "../cinepulse-data-backup-$(date +%Y%m%d-%H%M%S)"
```

If `DATABASE_PATH` is an absolute path, copy its parent directory instead. The folder must contain the configured database and any SQLite sidecars.

## Restore into a separate local installation

1. Stop the server that would use the destination database.
2. Make a new destination directory and copy the complete backup directory into it:

```sh
mkdir -p restore-test
cp -a ../cinepulse-data-backup-YYYYMMDD-HHMMSS/. restore-test/
```

3. Point a local process at the restored database, without changing the original:

```sh
DATABASE_PATH="$PWD/restore-test/cinepulse.db" npm run dev
```

On startup Cinepulse applies only supported, additive migrations in a transaction. It preserves existing IDs, sessions, votes, reviews, and history. The application refuses to open a database with a newer schema version rather than downgrading it.

To verify a restore without using a real account, run the isolated migration/backup regression tests:

```sh
node --import tsx --test tests/migrations.test.ts
```

## Important limitations

- Restore is a local file operation, not an online backup service.
- Do not overwrite a working database until the backup has been copied and inspected.
- Keep backups encrypted or access-controlled if they contain real account information.
- Deleting an account remains destructive even if an older backup exists. Follow the account's privacy request and retention policy before retaining or restoring personal data.
- The `api_cache` table is operational, short-lived data. It may be cleaned during startup; it is not a historical research dataset.

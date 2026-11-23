# SQLite migration history (reference only)

These files document how the SQLite schema evolved to version 13. They are **not executed**:
the SQLite schema is created and upgraded by `migrate()` in `lib/db.ts`, and Postgres uses
`migrations/pg/*.sql` (applied automatically by `lib/db/drivers.ts`). Two files share the
numbers 0009 and 0010 because they were written on parallel branches.

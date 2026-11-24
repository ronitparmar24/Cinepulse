/**
 * DATABASE_URL as pasted into a dashboard often carries harmless extras: surrounding quotes,
 * spaces or a newline, or the "DATABASE_URL=" prefix copied from an .env file. These are
 * stripped so a correct connection string is never ignored because of them.
 */
export function normalizeDatabaseUrl(raw: string | undefined | null): string {
  let v = (raw ?? '').trim();
  v = v.replace(/^DATABASE_URL\s*=\s*/i, '').trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export function isPostgresUrl(raw: string | undefined | null): boolean {
  return /^postgres(ql)?:\/\//i.test(normalizeDatabaseUrl(raw));
}

/**
 * A safe hint about why a value is not a Postgres URL. Mentions only the scheme or shape,
 * never the value itself (it may contain a password).
 */
export function describeDatabaseUrlProblem(raw: string | undefined | null): string {
  const v = normalizeDatabaseUrl(raw);
  if (!v) return 'it is empty';
  if (/^https?:\/\/[^/]*supabase\.co/i.test(v)) {
    return 'it looks like the Supabase project URL (https://….supabase.co). Use the Postgres connection string from Project Settings → Database → Connection string (URI) instead';
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1];
  if (scheme) return `it starts with "${scheme}://" instead of "postgresql://"`;
  return 'it does not start with "postgresql://"';
}

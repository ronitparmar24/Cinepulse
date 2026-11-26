/**
 * Catalog data is the same for everyone (it varies only by URL), so successful GETs are cached
 * at the CDN edge: repeat visits are served without running a function or calling TMDB.
 * Everything else defaults to private, no-store, so no shared cache ever keeps personal data.
 * Handlers that set their own Cache-Control (share images, calendar files) keep it.
 */
const PUBLIC_CACHE: Record<string, string> = {
  catalog: 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600',
  genres: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  title: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  providers: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  similar: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  recommended: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  person: 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800',
  trailers: 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
  artwork: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  anime: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  news: 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
  currency: 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400',
  streaming: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  'hype-radar': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400',
};
export function applyCachePolicy(res: Response, method: string, segment: string): void {
  if (res.headers.has('Cache-Control')) return;
  const policy = method === 'GET' && res.status === 200 && !res.headers.has('Set-Cookie') ? PUBLIC_CACHE[segment] : undefined;
  res.headers.set('Cache-Control', policy ?? 'private, no-store');
  if (!policy) res.headers.set('Vary', 'Cookie');
}

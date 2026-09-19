import { unifiedFetch, logMissingKeyOnce } from './base';

export interface OmdbRatings {
  imdbId: string;
  imdbRating: number | null;
  rottenTomatoesPct: number | null;
  metascore: number | null;
  boxOffice: string | null;
  rated: string | null;
  awards: string | null;
}

export async function getOmdbRatings(imdbId: string): Promise<OmdbRatings | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('omdb', 'OMDB_API_KEY');
    return null;
  }
  if (!imdbId) return null;

  const endpoint = 'https://www.omdbapi.com/';
  const res = await unifiedFetch<{
    Response?: string;
    imdbRating?: string;
    Metascore?: string;
    BoxOffice?: string;
    Rated?: string;
    Awards?: string;
    Ratings?: Array<{ Source: string; Value: string }>;
  }>({
    provider: 'omdb',
    endpoint,
    params: {
      i: imdbId,
      apikey: apiKey,
    },
    ttlMs: 24 * 60 * 60 * 1000, // 24h cache
  });

  if (res.data?.Response === 'False' || !res.data) return null;

  let rtPct: number | null = null;
  if (Array.isArray(res.data.Ratings)) {
    const rt = res.data.Ratings.find(r => r.Source === 'Rotten Tomatoes');
    if (rt?.Value) {
      const parsed = parseInt(rt.Value.replace('%', ''), 10);
      if (!isNaN(parsed)) rtPct = parsed;
    }
  }

  const imdbNum = parseFloat(res.data.imdbRating || '');
  const metaNum = parseInt(res.data.Metascore || '', 10);

  return {
    imdbId,
    imdbRating: isNaN(imdbNum) ? null : imdbNum,
    rottenTomatoesPct: rtPct,
    metascore: isNaN(metaNum) ? null : metaNum,
    boxOffice: res.data.BoxOffice && res.data.BoxOffice !== 'N/A' ? res.data.BoxOffice : null,
    rated: res.data.Rated && res.data.Rated !== 'N/A' ? res.data.Rated : null,
    awards: res.data.Awards && res.data.Awards !== 'N/A' ? res.data.Awards : null,
  };
}

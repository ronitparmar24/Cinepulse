/**
 * CinePulse — Fanart.tv Artwork Provider Fetcher
 *
 * Real response shape recorded from webservice.fanart.tv/v3/movies/{tmdb_id}:
 * {
 *   "name": "Interstellar",
 *   "tmdb_id": "157336",
 *   "imdb_id": "tt0816692",
 *   "hdmovielogo": [
 *     {
 *       "id": "10029",
 *       "url": "https://assets.fanart.tv/fanart/movies/157336/hdmovielogo/interstellar-547c617b3ebfb.png",
 *       "lang": "en",
 *       "likes": "12"
 *     }
 *   ],
 *   "moviebackground": [
 *     {
 *       "id": "10030",
 *       "url": "https://assets.fanart.tv/fanart/movies/157336/moviebackground/interstellar-547c615568da4.jpg",
 *       "lang": "en",
 *       "likes": "8"
 *     }
 *   ]
 * }
 */

import { unifiedFetch, logMissingKeyOnce } from './base';

export interface FanartArtwork {
  titleLogoUrl: string | null;
  backgroundUrl: string | null;
}

export interface HeroArtworkResolution {
  logoUrl: string | null;
  backgroundUrl: string | null;
  source: 'fanart' | 'tmdb' | 'text';
  fallbackText: string;
}

/**
 * Fetch Fanart.tv artwork for a TMDB movie id.
 * Cached indefinitely (artwork rarely changes).
 */
export async function getFanartMovieArtwork(tmdbId: string | number): Promise<FanartArtwork | null> {
  const apiKey = process.env.FANART_API_KEY;
  if (!apiKey) {
    logMissingKeyOnce('fanart', 'FANART_API_KEY');
    return null;
  }

  const endpoint = `https://webservice.fanart.tv/v3/movies/${tmdbId}`;

  const res = await unifiedFetch<{
    hdmovielogo?: Array<{ url: string; lang?: string }>;
    movielogo?: Array<{ url: string; lang?: string }>;
    moviebackground?: Array<{ url: string }>;
  }>({
    provider: 'fanart',
    endpoint,
    params: { api_key: apiKey },
    ttlMs: 365 * 24 * 60 * 60 * 1000, // Cache indefinitely
  });

  if (!res.data) return null;

  const logos = res.data.hdmovielogo || res.data.movielogo || [];
  const enLogo = logos.find((l) => l.lang === 'en') || logos[0];
  const backgrounds = res.data.moviebackground || [];

  return {
    titleLogoUrl: enLogo ? enLogo.url : null,
    backgroundUrl: backgrounds.length > 0 ? backgrounds[0].url : null,
  };
}

/**
 * Fallback chain:
 * 1. Fanart HD logo
 * 2. TMDB /images logo (if provided)
 * 3. Plain text title
 */
export async function resolveHeroArtwork(
  tmdbId: string | number,
  titleName: string,
  tmdbLogoUrl?: string | null,
  tmdbBackdropUrl?: string | null
): Promise<HeroArtworkResolution> {
  try {
    const fanart = await getFanartMovieArtwork(tmdbId);
    if (fanart && fanart.titleLogoUrl) {
      return {
        logoUrl: fanart.titleLogoUrl,
        backgroundUrl: fanart.backgroundUrl || tmdbBackdropUrl || null,
        source: 'fanart',
        fallbackText: titleName,
      };
    }
  } catch {}

  if (tmdbLogoUrl) {
    return {
      logoUrl: tmdbLogoUrl,
      backgroundUrl: tmdbBackdropUrl || null,
      source: 'tmdb',
      fallbackText: titleName,
    };
  }

  return {
    logoUrl: null,
    backgroundUrl: tmdbBackdropUrl || null,
    source: 'text',
    fallbackText: titleName,
  };
}

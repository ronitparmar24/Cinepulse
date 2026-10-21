/**
 * CinePulse — AniList Anime GraphQL Provider Fetcher
 *
 * Keyless GraphQL API for anime metadata, complementary to Jikan.
 * Real response shape recorded from https://graphql.anilist.co:
 * {
 *   "data": {
 *     "Media": {
 *       "id": 16498,
 *       "idMal": 16498,
 *       "title": {
 *         "romaji": "Shingeki no Kyojin",
 *         "english": "Attack on Titan",
 *         "native": "進撃の巨人"
 *       },
 *       "averageScore": 85,
 *       "popularity": 1065199,
 *       "trending": 30,
 *       "format": "TV",
 *       "status": "FINISHED",
 *       "episodes": 25,
 *       "seasonYear": 2013
 *     }
 *   }
 * }
 */

import { unifiedFetch } from './base';

export interface AniListAnimeInfo {
  id: number;
  malId?: number | null;
  title: string;
  romajiTitle: string;
  nativeTitle?: string;
  averageScore?: number | null;
  popularity: number;
  trendingRank?: number | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  seasonYear?: number | null;
}

const ANIME_QUERY = `
  query ($search: String) {
    Media(search: $search, type: ANIME) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      averageScore
      popularity
      trending
      format
      status
      episodes
      seasonYear
    }
  }
`;

/**
 * Search anime metadata on AniList GraphQL API.
 * Completely keyless, cached for 24h.
 */
export async function getAniListAnime(searchQuery: string): Promise<AniListAnimeInfo | null> {
  if (!searchQuery || !searchQuery.trim()) return null;

  try {
    const res = await unifiedFetch<{
      data?: {
        Media?: {
          id: number;
          idMal?: number | null;
          title?: {
            romaji?: string;
            english?: string;
            native?: string;
          };
          averageScore?: number | null;
          popularity?: number;
          trending?: number | null;
          format?: string | null;
          status?: string | null;
          episodes?: number | null;
          seasonYear?: number | null;
        };
      };
    }>({
      provider: 'anilist',
      endpoint: 'https://graphql.anilist.co',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: ANIME_QUERY,
        variables: { search: searchQuery.trim() },
      }),
      ttlMs: 24 * 60 * 60 * 1000,
    });

    const media = res.data?.data?.Media;
    if (!media) return null;

    const engTitle = media.title?.english || media.title?.romaji || searchQuery;
    const romajiTitle = media.title?.romaji || engTitle;

    return {
      id: media.id,
      malId: media.idMal,
      title: engTitle,
      romajiTitle,
      nativeTitle: media.title?.native,
      averageScore: media.averageScore,
      popularity: media.popularity || 0,
      trendingRank: media.trending,
      format: media.format,
      status: media.status,
      episodes: media.episodes,
      seasonYear: media.seasonYear,
    };
  } catch {
    return null;
  }
}

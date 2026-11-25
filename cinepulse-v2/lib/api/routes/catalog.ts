/**
 * /api/health, /api/config, /api/trailers, /api/news, /api/trakt, /api/streaming, /api/theaters, /api/artwork, /api/anime, /api/catalog, /api/genres, /api/title, /api/providers, /api/similar, /api/recommended, /api/person, /api/currency, /api/cinema-map, /api/hype-radar
 * Moved verbatim from the former catch-all route; returns null when no branch matches.
 */

import {
  catalog,
  catalogConfig,
  checkCatalogHealth,
  genres,
  person,
  recommended,
  season,
  similar,
  titleById,
  watchProviders,
} from '../../catalog';
import { buildCinemaGraph } from '../../cinemaMap';
import { getHypeRadarData } from '../../cron/snapshotHype';
import { bad } from '../../errors';
import { getExchangeRates } from '../../fetchers/currency';
import type { ApiContext } from '../http';
import { collection, json, media, optRating, optYear, page, param } from '../http';

export async function handleCatalog({ request, parts, method, query }: ApiContext): Promise<Response | null> {
  if (parts[0] === 'health' && parts.length === 1 && method === 'GET') {
    const { getProviderHealth } = await import('../../providers/usage');
    return json({ ...catalogConfig(), health: await checkCatalogHealth(false), providers: await getProviderHealth() });
  }

  if (parts[0] === 'config' && parts[1] === 'health' && parts.length === 2 && method === 'GET') {
    const { getProviderHealth } = await import('../../providers/usage');
    return json({ ...catalogConfig(), health: await checkCatalogHealth(false), providers: await getProviderHealth() });
  }

  if (parts[0] === 'config' && parts[1] === 'health' && parts[2] === 'retry' && parts.length === 3 && method === 'POST') {
    // This endpoint has no body and is Origin-protected by the dispatcher. It
    // performs one bounded provider check; it never returns or logs the token.
    const { getProviderHealth } = await import('../../providers/usage');
    return json({ ...catalogConfig(), health: await checkCatalogHealth(true), providers: await getProviderHealth() });
  }

  // ── GET /api/calendar/:titleId → an .ics file for the release date (no account needed)
  if (parts[0] === 'calendar' && parts.length === 2 && method === 'GET') {
    const id = param(parts, 1, 'title id');
    const { titleById } = await import('../../catalog');
    const { buildIcs, canAddToCalendar, icsFileName } = await import('../../calendar');
    const { titlePath } = await import('../../slug');
    const title = await titleById(id);
    if (!canAddToCalendar(title)) throw bad('This title has no release date yet.');
    const origin = (process.env.APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, '');
    return new Response(buildIcs(title, `${origin}${titlePath(title)}`), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${icsFileName(title)}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  if (parts[0] === 'trailers' && parts[1] === 'trending' && method === 'GET') {
    const { getLiveTrendingTrailers } = await import('../../fetchers/youtube');
    const limit = Number(query.get('limit')) || 12;
    return json({ trailers: await getLiveTrendingTrailers(limit) });
  }

  if (parts[0] === 'news' && parts.length === 2 && method === 'GET') {
    const { getNewsCoverage } = await import('../../fetchers/news');
    return json({ news: await getNewsCoverage(param(parts, 1, 'id')) });
  }

  if (parts[0] === 'trakt' && parts[1] === 'anticipated' && method === 'GET') {
    const { getLiveMostAnticipated } = await import('../../fetchers/trakt');
    const limit = Number(query.get('limit')) || 12;
    const items = await getLiveMostAnticipated(limit);
    return json({ items, source: 'live-trakt-tmdb', fetchedAt: new Date().toISOString() });
  }

  if (parts[0] === 'streaming' && parts[1] === 'leaving-soon' && method === 'GET') {
    const { getLiveStreamingRadar } = await import('../../fetchers/streaming-availability');
    const region = query.get('region') || 'us';
    const days = Number(query.get('days')) || 30;
    const limit = Number(query.get('limit')) || 24;
    const radar = await getLiveStreamingRadar(region, days, limit);
    return json(radar);
  }

  if (parts[0] === 'theaters' && parts[1] === 'nearby' && method === 'GET') {
    const { findNearbyTheaters, detectLocationFromIp } = await import('../../fetchers/theaters');
    let lat = query.get('lat') ? parseFloat(query.get('lat')!) : undefined;
    let lon = query.get('lon') ? parseFloat(query.get('lon')!) : undefined;
    let city = query.get('city') || undefined;
    const region = query.get('region') || 'IN';
    const autoLocate = query.get('autoLocate') === '1';

    if (autoLocate && (!Number.isFinite(lat) || !Number.isFinite(lon)) && !city) {
      const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
      const ipGeo = await detectLocationFromIp(forwarded);
      if (ipGeo) {
        lat = ipGeo.lat;
        lon = ipGeo.lon;
        city = ipGeo.cityLabel;
        const result = await findNearbyTheaters(lat, lon, city, ipGeo.countryCode || region);
        return json({ ...result, countryCode: ipGeo.countryCode || result.countryCode, locationMethod: 'ip' });
      }
    }

    return json(await findNearbyTheaters(lat, lon, city, region));
  }

  if (parts[0] === 'artwork' && parts.length === 2 && method === 'GET') {
    const { resolveHeroArtwork } = await import('../../fetchers/fanart');
    return json(await resolveHeroArtwork(param(parts, 1, 'id'), query.get('title') || ''));
  }

  if (parts[0] === 'anime' && parts.length === 2 && method === 'GET') {
    const { getAniListAnime } = await import('../../fetchers/anilist');
    return json({ anime: await getAniListAnime(decodeURIComponent(param(parts, 1, 'query'))) });
  }

  if (parts[0] === 'config' && parts.length === 1 && method === 'GET') return json(catalogConfig());

  if (parts[0] === 'catalog' && method === 'GET')
    return json(
      await catalog({
        media: media(query.get('media')),
        collection: collection(query.get('collection')),
        search: query.get('query') || undefined,
        genre: query.get('genre') || undefined,
        page: page(query.get('page')),
        year: optYear(query.get('year')),
        minRating: optRating(query.get('minRating')),
        sortBy: query.get('sortBy') || undefined,
        language: query.get('language') || query.get('with_original_language') || undefined,
      }),
    );

  if (parts[0] === 'genres' && method === 'GET') return json(await genres(media(query.get('media'))));

  if (parts[0] === 'title' && parts.length >= 2 && method === 'GET') {
    const id = param(parts, 1, 'id');
    if (parts.length === 4 && parts[2] === 'season') {
      const n = Number(parts[3]);
      if (!Number.isInteger(n) || n < 1 || n > 100) throw bad('Season number is invalid');
      return json(await season(id, n));
    }
    if (parts.length === 3 && parts[2] === 'news') {
      const { getNewsCoverage } = await import('../../fetchers/news');
      return json({ news: await getNewsCoverage(id) });
    }
    if (parts.length !== 2) throw bad('Invalid title path');
    return json({ title: await titleById(id) });
  }

  // Feature 1: Watch Providers (TMDB + Watchmode Direct Player Links)
  if (parts[0] === 'providers' && parts.length === 2 && method === 'GET') {
    const id = param(parts, 1, 'id');
    const region = query.get('region') || undefined;
    const providers = await watchProviders(id, region);
    let directSources: any[] = [];
    if (!id.startsWith('demo-')) {
      const [mediaType, num] = id.split('-');
      if (num) {
        try {
          const { getWatchmodeDirectSources } = await import('../../fetchers/watchmode');
          directSources = await getWatchmodeDirectSources(num, mediaType === 'tv' ? 'tv' : 'movie');
        } catch {
          directSources = [];
        }
      }
    }
    return json({ providers, directSources });
  }

  // Feature 2: Similar & Recommended
  if (parts[0] === 'similar' && parts.length === 2 && method === 'GET') return json({ items: await similar(param(parts, 1, 'id')) });

  if (parts[0] === 'recommended' && parts.length === 2 && method === 'GET')
    return json({ items: await recommended(param(parts, 1, 'id')) });

  // Feature 3: Person Profile
  if (parts[0] === 'person' && parts.length === 2 && method === 'GET') {
    const pid = Number(parts[1]);
    if (!Number.isInteger(pid) || pid < 1) throw bad('Invalid person id');
    return json({ person: await person(pid) });
  }

  if (parts[0] === 'currency' && method === 'GET') return json(await getExchangeRates());

  // ─── Track C3: Cinema Map ───────────────────────────────────────────────────
  if (parts[0] === 'cinema-map' && parts.length === 2 && method === 'GET') {
    const graph = await buildCinemaGraph(param(parts, 1, 'titleId'));
    return json({ graph });
  }

  // ─── Track L4: Hype Radar Data ──────────────────────────────────────────────
  if (parts[0] === 'hype-radar' && parts.length === 2 && method === 'GET') {
    const radar = await getHypeRadarData(param(parts, 1, 'titleId'));
    return json(radar);
  }
  return null;
}

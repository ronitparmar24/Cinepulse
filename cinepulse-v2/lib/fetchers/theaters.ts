import { cacheGet, cacheSet } from '../db';

export interface NearbyTheater {
  id: string;
  name: string;
  chain?: string;
  distanceKm: number;
  address: string;
  website?: string | null;
  lat: number;
  lon: number;
}

const FALLBACK_THEATERS: Record<string, NearbyTheater[]> = {
  in: [
    {
      id: 'pvr-mumbai-1',
      name: 'PVR INOX Palladium IMAX',
      chain: 'PVR INOX',
      distanceKm: 2.4,
      address: 'High Street Phoenix, Lower Parel, Mumbai',
      website: 'https://www.pvrcinemas.com',
      lat: 18.9953,
      lon: 72.8242,
    },
    {
      id: 'cinepolis-mumbai-2',
      name: 'Cinépolis Andheri VIP',
      chain: 'Cinépolis',
      distanceKm: 4.8,
      address: 'Fun Republic Mall, Andheri West, Mumbai',
      website: 'https://www.cinepolisindia.com',
      lat: 19.1363,
      lon: 72.8306,
    },
    {
      id: 'pvr-delhi-1',
      name: 'PVR Plaza CP IMAX',
      chain: 'PVR INOX',
      distanceKm: 3.1,
      address: 'Connaught Place, New Delhi',
      website: 'https://www.pvrcinemas.com',
      lat: 28.6327,
      lon: 77.2195,
    },
    {
      id: 'pvr-bengaluru-1',
      name: 'PVR Forum Koramangala',
      chain: 'PVR INOX',
      distanceKm: 3.5,
      address: 'Hosur Rd, Koramangala, Bengaluru',
      website: 'https://www.pvrcinemas.com',
      lat: 12.9345,
      lon: 77.6111,
    },
  ],
  us: [
    {
      id: 'amc-lincoln-sq',
      name: 'AMC Lincoln Square 13 IMAX',
      chain: 'AMC',
      distanceKm: 1.8,
      address: '1998 Broadway, New York, NY',
      website: 'https://www.amctheatres.com',
      lat: 40.7738,
      lon: -73.9822,
    },
    {
      id: 'regal-union-sq',
      name: 'Regal Union Square ScreenX',
      chain: 'Regal',
      distanceKm: 2.5,
      address: '850 Broadway, New York, NY',
      website: 'https://www.regmovies.com',
      lat: 40.7359,
      lon: -73.9911,
    },
  ],
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export async function findNearbyTheaters(
  lat?: number,
  lon?: number,
  city?: string,
  region = 'IN'
): Promise<{ source: 'osm' | 'curated'; cityLabel: string; theaters: NearbyTheater[] }> {
  let targetLat = lat;
  let targetLon = lon;
  let cityLabel = city || (region.toUpperCase() === 'IN' ? 'Mumbai' : 'New York');

  // Step 1: If city provided, geocode via OpenStreetMap Nominatim
  if (city && (!targetLat || !targetLon)) {
    const geoKey = `geocode:${city.toLowerCase().trim()}`;
    const cachedGeo = cacheGet<{ lat: number; lon: number; display: string }>(geoKey);

    if (cachedGeo) {
      targetLat = cachedGeo.lat;
      targetLon = cachedGeo.lon;
      cityLabel = cachedGeo.display.split(',')[0] || city;
    } else {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          city
        )}&format=json&limit=1`;
        const nomRes = await fetch(nomUrl, {
          headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
          signal: AbortSignal.timeout(4000),
        });

        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (Array.isArray(nomData) && nomData.length > 0) {
            targetLat = parseFloat(nomData[0].lat);
            targetLon = parseFloat(nomData[0].lon);
            cityLabel = nomData[0].display_name.split(',')[0] || city;
            cacheSet(geoKey, { lat: targetLat, lon: targetLon, display: cityLabel }, 86_400_000);
          }
        }
      } catch {
        // Continue with fallbacks
      }
    }
  }

  // Default coordinate if neither geolocation nor geocode succeeded
  if (!targetLat || !targetLon) {
    if (region.toUpperCase() === 'IN') {
      targetLat = 19.076;
      targetLon = 72.8777; // Mumbai
    } else {
      targetLat = 40.7128;
      targetLon = -74.006; // New York
    }
  }

  const cacheKey = `theaters:v1:${targetLat.toFixed(2)}:${targetLon.toFixed(2)}`;
  const cachedTheaters = cacheGet<NearbyTheater[]>(cacheKey);
  if (cachedTheaters && cachedTheaters.length > 0) {
    return { source: 'osm', cityLabel, theaters: cachedTheaters };
  }

  // Step 2: Query OpenStreetMap Overpass with 4-second bounded timeout
  try {
    const overpassQuery = `[out:json][timeout:4];node(around:15000,${targetLat},${targetLon})[amenity=cinema];out 10;`;
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    const res = await fetch(overpassUrl, {
      headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.elements) && data.elements.length > 0) {
        const parsed: NearbyTheater[] = [];

        for (const el of data.elements) {
          const name = el.tags?.name;
          if (!name) continue;

          const distanceKm = haversineDistance(targetLat, targetLon, el.lat, el.lon);
          const address =
            el.tags?.['addr:street'] ||
            el.tags?.['addr:suburb'] ||
            el.tags?.['addr:city'] ||
            'Nearby Theater';

          const website = el.tags?.website || el.tags?.url || null;

          let chain = 'Independent Cinema';
          const lowerName = name.toLowerCase();
          if (lowerName.includes('pvr')) chain = 'PVR INOX';
          else if (lowerName.includes('inox')) chain = 'PVR INOX';
          else if (lowerName.includes('cinepolis') || lowerName.includes('cinépolis')) chain = 'Cinépolis';
          else if (lowerName.includes('amc')) chain = 'AMC';
          else if (lowerName.includes('regal')) chain = 'Regal';
          else if (lowerName.includes('cineworld')) chain = 'Cineworld';

          parsed.push({
            id: `osm-${el.id}`,
            name,
            chain,
            distanceKm,
            address,
            website,
            lat: el.lat,
            lon: el.lon,
          });
        }

        parsed.sort((a, b) => a.distanceKm - b.distanceKm);

        if (parsed.length > 0) {
          cacheSet(cacheKey, parsed, 86_400_000); // 24-hour cache
          return { source: 'osm', cityLabel, theaters: parsed };
        }
      }
    }
  } catch {
    // Overpass failed or timed out, gracefully degrade to verified regional circuits
  }

  // Step 3: Verified fallback circuit with calibrated distances from target coords
  const fallbacks = getCuratedTheaters(region, targetLat!, targetLon!);
  return { source: 'curated', cityLabel, theaters: fallbacks };
}

export function getCuratedTheaters(region = 'IN', targetLat = 19.076, targetLon = 72.8777): NearbyTheater[] {
  const regionKey = region.toLowerCase() === 'us' ? 'us' : 'in';
  const fallbacks = (FALLBACK_THEATERS[regionKey] || FALLBACK_THEATERS.in).map((t) => ({
    ...t,
    distanceKm: haversineDistance(targetLat, targetLon, t.lat, t.lon),
  }));
  fallbacks.sort((a, b) => a.distanceKm - b.distanceKm);
  return fallbacks;
}

import { cacheGet, cacheSet } from '../db';

export interface NearbyTheater {
  id: string;
  name: string;
  chain?: string;
  distanceKm: number;
  driveMinutes?: number;
  distanceType?: 'road' | 'air';
  address: string;
  website?: string | null;
  lat: number;
  lon: number;
}

interface CityCoord {
  lat: number;
  lon: number;
  label: string;
}

const CITY_COORDS: Record<string, CityCoord> = {
  mumbai: { lat: 19.076, lon: 72.8777, label: 'Mumbai' },
  bombay: { lat: 19.076, lon: 72.8777, label: 'Mumbai' },
  delhi: { lat: 28.6139, lon: 77.209, label: 'New Delhi' },
  'new delhi': { lat: 28.6139, lon: 77.209, label: 'New Delhi' },
  bengaluru: { lat: 12.9716, lon: 77.5946, label: 'Bengaluru' },
  bangalore: { lat: 12.9716, lon: 77.5946, label: 'Bengaluru' },
  ahmedabad: { lat: 23.0225, lon: 72.5714, label: 'Ahmedabad' },
  hyderabad: { lat: 17.385, lon: 78.4867, label: 'Hyderabad' },
  pune: { lat: 18.5204, lon: 73.8567, label: 'Pune' },
  chennai: { lat: 13.0827, lon: 80.2707, label: 'Chennai' },
  kolkata: { lat: 22.5726, lon: 88.3639, label: 'Kolkata' },
  surat: { lat: 21.1702, lon: 72.8311, label: 'Surat' },
  jaipur: { lat: 26.9124, lon: 75.7873, label: 'Jaipur' },
  kochi: { lat: 9.9312, lon: 76.2673, label: 'Kochi' },
  chandigarh: { lat: 30.7333, lon: 76.7794, label: 'Chandigarh' },
  'new york': { lat: 40.7128, lon: -74.006, label: 'New York' },
  nyc: { lat: 40.7128, lon: -74.006, label: 'New York' },
  manhattan: { lat: 40.758, lon: -73.9855, label: 'Manhattan, New York' },
  brooklyn: { lat: 40.6782, lon: -73.9442, label: 'Brooklyn, New York' },
  'los angeles': { lat: 34.0522, lon: -118.2437, label: 'Los Angeles' },
  la: { lat: 34.0522, lon: -118.2437, label: 'Los Angeles' },
  chicago: { lat: 41.8781, lon: -87.6298, label: 'Chicago' },
  'san francisco': { lat: 37.7749, lon: -122.4194, label: 'San Francisco' },
  seattle: { lat: 47.6062, lon: -122.3321, label: 'Seattle' },
  austin: { lat: 30.2672, lon: -97.7431, label: 'Austin' },
  boston: { lat: 42.3601, lon: -71.0589, label: 'Boston' },
  london: { lat: 51.5074, lon: -0.1278, label: 'London' },
  toronto: { lat: 43.6532, lon: -79.3832, label: 'Toronto' },
  singapore: { lat: 1.3521, lon: 103.8198, label: 'Singapore' },
  dubai: { lat: 25.2048, lon: 55.2708, label: 'Dubai' },
  tokyo: { lat: 35.6762, lon: 139.6503, label: 'Tokyo' },
  paris: { lat: 48.8566, lon: 2.3522, label: 'Paris' },
  sydney: { lat: -33.8688, lon: 151.2093, label: 'Sydney' },
};

const FALLBACK_THEATERS: Record<string, NearbyTheater[]> = {
  in: [
    {
      id: 'curated-pvr-mumbai-palladium',
      name: 'PVR ICON: Phoenix Palladium',
      chain: 'PVR INOX',
      distanceKm: 2.4,
      address: '462 Senapati Bapat Marg, Lower Parel, Mumbai',
      website: 'https://www.pvrcinemas.com',
      lat: 18.9953,
      lon: 72.8242,
    },
    {
      id: 'curated-inox-mumbai-metro',
      name: 'Metro INOX Cinema',
      chain: 'PVR INOX',
      distanceKm: 3.1,
      address: 'Mahatma Gandhi Road, Fort, Mumbai',
      website: 'https://www.inoxmovies.com',
      lat: 18.9433,
      lon: 72.8291,
    },
    {
      id: 'curated-maison-pvr-bkc',
      name: 'Maison PVR Jio World Drive',
      chain: 'PVR INOX',
      distanceKm: 5.2,
      address: 'Jio World Drive, Bandra Kurla Complex, Mumbai',
      website: 'https://www.pvrcinemas.com',
      lat: 19.0537,
      lon: 72.8511,
    },
    {
      id: 'curated-cinepolis-mumbai-andheri',
      name: 'Cinépolis Fun Republic',
      chain: 'Cinépolis',
      distanceKm: 6.8,
      address: 'New Link Road, Andheri West, Mumbai',
      website: 'https://www.cinepolisindia.com',
      lat: 19.1348,
      lon: 72.8329,
    },
    {
      id: 'curated-pvr-delhi-plaza',
      name: 'PVR Plaza Connaught Place',
      chain: 'PVR INOX',
      distanceKm: 1.9,
      address: 'H Block, Connaught Place, New Delhi',
      website: 'https://www.pvrcinemas.com',
      lat: 28.6327,
      lon: 77.2195,
    },
    {
      id: 'curated-pvr-delhi-priya',
      name: 'PVR Priya Vasant Vihar',
      chain: 'PVR INOX',
      distanceKm: 8.4,
      address: 'Basant Lok, Vasant Vihar, New Delhi',
      website: 'https://www.pvrcinemas.com',
      lat: 28.5579,
      lon: 77.1636,
    },
    {
      id: 'curated-pvr-bengaluru-nexus',
      name: 'PVR Nexus Koramangala',
      chain: 'PVR INOX',
      distanceKm: 3.5,
      address: 'Hosur Road, Koramangala, Bengaluru',
      website: 'https://www.pvrcinemas.com',
      lat: 12.9345,
      lon: 77.6111,
    },
    {
      id: 'curated-pvr-ahmedabad-acropolis',
      name: 'PVR Acropolis SG Highway',
      chain: 'PVR INOX',
      distanceKm: 4.1,
      address: 'Thaltej Cross Road, SG Highway, Ahmedabad',
      website: 'https://www.pvrcinemas.com',
      lat: 23.0497,
      lon: 72.5177,
    },
    {
      id: 'curated-sunset-ahmedabad',
      name: 'Sunset Drive-In Cinema',
      chain: 'Independent',
      distanceKm: 3.8,
      address: 'Drive In Road, Thaltej, Ahmedabad',
      website: null,
      lat: 23.0462,
      lon: 72.5333,
    },
  ],
  us: [
    {
      id: 'curated-metrograph-nyc',
      name: 'Metrograph',
      chain: 'Independent',
      distanceKm: 0.9,
      address: '7 Ludlow Street, Lower East Side, New York, NY',
      website: 'https://metrograph.com',
      lat: 40.715,
      lon: -73.991,
    },
    {
      id: 'curated-alamo-nyc-fidi',
      name: 'Alamo Drafthouse Lower Manhattan',
      chain: 'Alamo Drafthouse',
      distanceKm: 0.6,
      address: '28 Liberty Street, Financial District, New York, NY',
      website: 'https://drafthouse.com',
      lat: 40.7082,
      lon: -74.0089,
    },
    {
      id: 'curated-ifc-nyc',
      name: 'IFC Center',
      chain: 'Independent',
      distanceKm: 2.1,
      address: '323 6th Avenue, Greenwich Village, New York, NY',
      website: 'https://www.ifccenter.com',
      lat: 40.7311,
      lon: -74.0017,
    },
    {
      id: 'curated-regal-union-sq',
      name: 'Regal Union Square',
      chain: 'Regal',
      distanceKm: 2.6,
      address: '850 Broadway, Union Square, New York, NY',
      website: 'https://www.regmovies.com',
      lat: 40.7359,
      lon: -73.9911,
    },
    {
      id: 'curated-amc-empire-25',
      name: 'AMC Empire 25',
      chain: 'AMC',
      distanceKm: 4.8,
      address: '234 West 42nd Street, Times Square, New York, NY',
      website: 'https://www.amctheatres.com',
      lat: 40.7568,
      lon: -73.9893,
    },
    {
      id: 'curated-amc-lincoln-sq',
      name: 'AMC Lincoln Square 13 IMAX',
      chain: 'AMC',
      distanceKm: 7.0,
      address: '1998 Broadway, Upper West Side, New York, NY',
      website: 'https://www.amctheatres.com',
      lat: 40.7738,
      lon: -73.9822,
    },
    {
      id: 'curated-tcl-la',
      name: 'TCL Chinese Theatre IMAX',
      chain: 'Independent',
      distanceKm: 9.2,
      address: '6925 Hollywood Blvd, Los Angeles, CA',
      website: 'https://www.tclchinesetheatres.com',
      lat: 34.102,
      lon: -118.341,
    },
    {
      id: 'curated-musicbox-chicago',
      name: 'Music Box Theatre',
      chain: 'Independent',
      distanceKm: 7.8,
      address: '3733 N Southport Ave, Chicago, IL',
      website: 'https://musicboxtheatre.com',
      lat: 41.9498,
      lon: -87.6637,
    },
  ],
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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

function detectChain(name: string, brand?: string, operator?: string): string | undefined {
  const combined = `${name} ${brand || ''} ${operator || ''}`.toLowerCase();
  if (/\b(pvr|inox|maison pvr)\b/.test(combined)) return 'PVR INOX';
  if (/cin[eé]polis/.test(combined)) return 'Cinépolis';
  if (/\bmiraj\b/.test(combined)) return 'Miraj';
  if (/\bmukta\b/.test(combined)) return 'Mukta A2';
  if (/\bmovietime\b/.test(combined)) return 'Movietime';
  if (/\bamc\b/.test(combined)) return 'AMC';
  if (/\bregal\b/.test(combined)) return 'Regal';
  if (/\bcinemark\b/.test(combined)) return 'Cinemark';
  if (/\balamo\b/.test(combined)) return 'Alamo Drafthouse';
  if (/\bangelika\b/.test(combined)) return 'Angelika';
  if (/\bodeon\b/.test(combined)) return 'Odeon';
  if (/\bcineworld\b/.test(combined)) return 'Cineworld';
  if (/\beveryman\b/.test(combined)) return 'Everyman';
  if (/\bcurzon\b/.test(combined)) return 'Curzon';
  if (/\bvue\b/.test(combined)) return 'Vue';
  if (/\bbfi\b/.test(combined)) return 'BFI';
  const rawBrand = (brand || operator || '').trim();
  if (rawBrand && rawBrand.length <= 24) return rawBrand;
  return undefined;
}

function normalizeWebsite(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function formatNominatimAddress(addr: Record<string, string> | undefined, fallbackCity: string): string {
  if (!addr) return fallbackCity;
  const street = [addr.house_number, addr.road].filter(Boolean).join(' ').trim();
  const area = addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || '';
  const locality = addr.city || addr.town || addr.village || addr.state_district || fallbackCity;
  const stateLabel =
    addr.state && locality && addr.state.toLowerCase() === locality.toLowerCase() ? '' : addr.state || '';
  const stateOrPin = [stateLabel, addr.postcode].filter(Boolean).join(' ').trim();

  const parts: string[] = [];
  for (const part of [street, area, locality, stateOrPin]) {
    if (!part) continue;
    const lower = part.toLowerCase();
    if (!parts.some((existing) => existing.toLowerCase() === lower || existing.toLowerCase().includes(lower))) {
      parts.push(part);
    }
  }
  return parts.join(', ') || fallbackCity;
}

function formatOverpassAddress(tags: Record<string, string> | undefined, fallbackCity: string): string {
  if (!tags) return fallbackCity;
  if (tags['addr:full']) return tags['addr:full'];
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ').trim();
  const area = tags['addr:suburb'] || tags['addr:neighbourhood'] || '';
  const city = tags['addr:city'] || tags['addr:town'] || fallbackCity;
  const parts: string[] = [];
  for (const part of [street, area, city]) {
    if (!part) continue;
    if (!parts.some((p) => p.toLowerCase() === part.toLowerCase())) {
      parts.push(part);
    }
  }
  return parts.join(', ') || fallbackCity;
}

function isClosedCinema(name: string, tags?: Record<string, string>): boolean {
  if (tags?.disused === 'yes' || tags?.abandoned === 'yes') return true;
  return /\b(closed|permanently closed|demolished|shut down)\b/i.test(name);
}

function normalizeTheaterName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function fetchNominatimCinemas(
  targetLat: number,
  targetLon: number,
  fallbackCity: string
): Promise<{ theaters: NearbyTheater[]; inferredCity?: string; inferredCountry?: string }> {
  const latDelta = 0.16;
  const lonDelta = 0.16 / Math.max(0.25, Math.cos((targetLat * Math.PI) / 180));
  const viewbox = [
    (targetLon - lonDelta).toFixed(4),
    (targetLat + latDelta).toFixed(4),
    (targetLon + lonDelta).toFixed(4),
    (targetLat - latDelta).toFixed(4),
  ].join(',');

  const url = `https://nominatim.openstreetmap.org/search?q=cinema&format=jsonv2&addressdetails=1&extratags=1&limit=40&bounded=1&viewbox=${viewbox}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
    signal: AbortSignal.timeout(4500),
  });

  if (!res.ok) return { theaters: [] };
  const data = (await res.json()) as Array<{
    osm_type?: string;
    osm_id?: number;
    place_id?: number;
    category?: string;
    type?: string;
    name?: string;
    lat?: string;
    lon?: string;
    address?: Record<string, string>;
    extratags?: Record<string, string>;
  }>;

  if (!Array.isArray(data)) return { theaters: [] };

  const parsed: NearbyTheater[] = [];
  let inferredCity: string | undefined;
  let closestDist = Infinity;
  let inferredCountry: string | undefined;

  for (const el of data) {
    if (el.category !== 'amenity' || el.type !== 'cinema') continue;
    const name = el.name?.trim();
    if (!name || isClosedCinema(name, el.extratags)) continue;
    const lat = Number(el.lat);
    const lon = Number(el.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const distanceKm = haversineDistance(targetLat, targetLon, lat, lon);
    if (distanceKm > 25) continue;

    if (distanceKm < closestDist) {
      closestDist = distanceKm;
      const cityPart = el.address?.city || el.address?.town || el.address?.state_district;
      const areaPart = el.address?.suburb || el.address?.neighbourhood;
      if (areaPart && cityPart && areaPart.toLowerCase() !== cityPart.toLowerCase() && distanceKm <= 4) {
        inferredCity = `${areaPart}, ${cityPart}`;
      } else if (cityPart || areaPart) {
        inferredCity = cityPart || areaPart;
      }
      if (el.address?.country_code) {
        inferredCountry = el.address.country_code.toUpperCase();
      }
    }

    parsed.push({
      id: `osm-${el.osm_type || 'node'}-${el.osm_id || el.place_id}`,
      name,
      chain: detectChain(name, el.extratags?.brand, el.extratags?.operator),
      distanceKm,
      address: formatNominatimAddress(el.address, fallbackCity),
      website: normalizeWebsite(el.extratags?.website || el.extratags?.url),
      lat,
      lon,
    });
  }

  return { theaters: parsed, inferredCity, inferredCountry };
}

async function fetchOverpassCinemas(
  targetLat: number,
  targetLon: number,
  fallbackCity: string
): Promise<NearbyTheater[]> {
  const query = `[out:json][timeout:4];nwr(around:15000,${targetLat},${targetLon})[amenity=cinema];out center tags 40;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(4000),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as {
    elements?: Array<{
      id: number;
      type?: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };
  if (!Array.isArray(data?.elements)) return [];

  const parsed: NearbyTheater[] = [];
  for (const el of data.elements) {
    const name = el.tags?.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || isClosedCinema(name, el.tags) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const distanceKm = haversineDistance(targetLat, targetLon, lat!, lon!);
    if (distanceKm > 25) continue;

    parsed.push({
      id: `osm-${el.type || 'node'}-${el.id}`,
      name,
      chain: detectChain(name, el.tags?.brand, el.tags?.operator),
      distanceKm,
      address: formatOverpassAddress(el.tags, fallbackCity),
      website: normalizeWebsite(el.tags?.website || el.tags?.url),
      lat: lat!,
      lon: lon!,
    });
  }

  return parsed;
}

function mergeAndDeduplicateTheaters(lists: NearbyTheater[][]): NearbyTheater[] {
  const merged: NearbyTheater[] = [];
  for (const list of lists) {
    for (const item of list) {
      const norm = normalizeTheaterName(item.name);
      const existingIdx = merged.findIndex((m) => {
        const sameName = normalizeTheaterName(m.name) === norm;
        const closeCoords = haversineDistance(m.lat, m.lon, item.lat, item.lon) <= 0.35;
        return sameName && closeCoords;
      });
      if (existingIdx === -1) {
        merged.push(item);
      } else {
        const cur = merged[existingIdx];
        merged[existingIdx] = {
          ...cur,
          chain: cur.chain || item.chain,
          website: cur.website || item.website,
          address: item.address.length > cur.address.length ? item.address : cur.address,
        };
      }
    }
  }
  merged.sort((a, b) => a.distanceKm - b.distanceKm);
  return merged.slice(0, 20);
}

async function enrichRoadDistances(
  originLat: number,
  originLon: number,
  theaters: NearbyTheater[]
): Promise<NearbyTheater[]> {
  if (theaters.length === 0) return theaters;
  const targetList = theaters.slice(0, 20);
  const coordsParam = [`${originLon},${originLat}`, ...targetList.map((t) => `${t.lon},${t.lat}`)].join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coordsParam}?sources=0&annotations=distance,duration`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return targetList;
    const data = (await res.json()) as {
      code?: string;
      distances?: Array<Array<number | null>>;
      durations?: Array<Array<number | null>>;
    };
    const dists = data?.distances?.[0];
    const durs = data?.durations?.[0];
    if (data?.code !== 'Ok' || !Array.isArray(dists)) return targetList;

    const enriched = targetList.map((t, idx) => {
      const meters = dists[idx + 1];
      const seconds = Array.isArray(durs) ? durs[idx + 1] : null;
      if (typeof meters === 'number' && Number.isFinite(meters) && meters >= 0) {
        return {
          ...t,
          distanceKm: Number((meters / 1000).toFixed(1)),
          driveMinutes: typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
            ? Math.max(1, Math.round(seconds / 60))
            : undefined,
          distanceType: 'road' as const,
        };
      }
      return { ...t, distanceType: 'air' as const };
    });

    enriched.sort((a, b) => a.distanceKm - b.distanceKm);
    return enriched;
  } catch {
    return targetList.map((t) => ({ ...t, distanceType: t.distanceType || 'air' }));
  }
}

function isPrivateOrLocalIp(ip?: string | null): boolean {
  if (!ip) return true;
  const clean = ip.trim().toLowerCase();
  return (
    clean === '::1' ||
    clean === 'localhost' ||
    clean.startsWith('127.') ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    clean.startsWith('::ffff:127.') ||
    clean.startsWith('fc') ||
    clean.startsWith('fd') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(clean)
  );
}

export async function reverseGeocodeCoords(
  lat: number,
  lon: number
): Promise<{ cityLabel: string; countryCode?: string } | null> {
  const revKey = `revgeo:v1:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const cached = cacheGet<{ cityLabel: string; countryCode?: string }>(revKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
      {
        headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        features?: Array<{
          properties?: {
            city?: string;
            district?: string;
            locality?: string;
            county?: string;
            state?: string;
            countrycode?: string;
          };
        }>;
      };
      const props = data?.features?.[0]?.properties;
      if (props) {
        const primary = props.district || props.locality || props.city || props.county || props.state;
        const secondary = props.city && primary && props.city.toLowerCase() !== primary.toLowerCase() ? props.city : '';
        const cityLabel = secondary ? `${primary}, ${secondary}` : primary || '';
        const countryCode = props.countrycode?.toUpperCase();
        if (cityLabel) {
          const out = { cityLabel, countryCode };
          cacheSet(revKey, out, 86_400_000);
          return out;
        }
      }
    }
  } catch {
    // Non-fatal; Nominatim cinema addresses will supply fallback label
  }
  return null;
}

export async function detectLocationFromIp(
  clientIp?: string | null
): Promise<{ lat: number; lon: number; cityLabel: string; countryCode?: string } | null> {
  const cleanIp = clientIp && !isPrivateOrLocalIp(clientIp) ? clientIp.split(',')[0].trim() : '';
  const cacheKey = `ipgeo:v1:${cleanIp || 'self'}`;
  const cached = cacheGet<{ lat: number; lon: number; cityLabel: string; countryCode?: string }>(cacheKey);
  if (cached) return cached;

  // Provider 1: ipinfo.io (fast IPv4 GeoIP accuracy)
  try {
    const url = cleanIp ? `https://ipinfo.io/${encodeURIComponent(cleanIp)}/json` : 'https://ipinfo.io/json';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const d = (await res.json()) as { city?: string; country?: string; loc?: string };
      if (d?.loc && d.loc.includes(',')) {
        const [latStr, lonStr] = d.loc.split(',');
        const lat = Number(latStr);
        const lon = Number(lonStr);
        if (Number.isFinite(lat) && Number.isFinite(lon) && d.city) {
          const out = { lat, lon, cityLabel: d.city, countryCode: d.country?.toUpperCase() };
          cacheSet(cacheKey, out, 900_000);
          return out;
        }
      }
    }
  } catch {
    // Fallback to ipapi.co below
  }

  // Provider 2: ipapi.co
  try {
    const url = cleanIp ? `https://ipapi.co/${encodeURIComponent(cleanIp)}/json/` : 'https://ipapi.co/json/';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const d = (await res.json()) as { city?: string; country_code?: string; latitude?: number; longitude?: number };
      if (typeof d?.latitude === 'number' && typeof d?.longitude === 'number' && d.city) {
        const out = {
          lat: d.latitude,
          lon: d.longitude,
          cityLabel: d.city,
          countryCode: d.country_code?.toUpperCase(),
        };
        cacheSet(cacheKey, out, 900_000);
        return out;
      }
    }
  } catch {
    // Unavailable
  }

  return null;
}

export interface NearbyTheatersResponse {
  source: 'osm' | 'curated';
  cityLabel: string;
  theaters: NearbyTheater[];
  countryCode?: string;
  locationMethod?: 'gps' | 'ip' | 'city';
  coordinates?: { lat: number; lon: number };
}

export async function findNearbyTheaters(
  lat?: number,
  lon?: number,
  city?: string,
  region = 'IN'
): Promise<NearbyTheatersResponse> {
  let targetLat = lat;
  let targetLon = lon;
  const trimmedCity = city?.trim();
  const hasExplicitGps = typeof lat === 'number' && Number.isFinite(lat) && typeof lon === 'number' && Number.isFinite(lon);
  let cityLabel = trimmedCity || (hasExplicitGps ? 'Current Location' : region.toUpperCase() === 'US' ? 'New York' : 'Mumbai');
  let countryCode: string | undefined;

  // Step 1: Resolve city coordinates cleanly (instant dictionary first, Nominatim + cache otherwise)
  let didNetworkGeocode = false;
  if (trimmedCity && (!targetLat || !targetLon)) {
    const cityKey = trimmedCity.toLowerCase();
    const known = CITY_COORDS[cityKey];
    if (known) {
      targetLat = known.lat;
      targetLon = known.lon;
      cityLabel = known.label;
    } else {
      const geoKey = `geocode:v2:${cityKey}`;
      const cachedGeo = cacheGet<{ lat: number; lon: number; display: string }>(geoKey);

      if (cachedGeo) {
        targetLat = cachedGeo.lat;
        targetLon = cachedGeo.lon;
        cityLabel = cachedGeo.display;
      } else {
        try {
          didNetworkGeocode = true;
          const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            trimmedCity
          )}&format=json&limit=1`;
          const nomRes = await fetch(nomUrl, {
            headers: { 'User-Agent': 'CinePulse/2.1 (theaters@cinepulse.local)' },
            signal: AbortSignal.timeout(4000),
          });

          if (nomRes.ok) {
            const nomData = await nomRes.json();
            if (Array.isArray(nomData) && nomData.length > 0) {
              const parsedLat = parseFloat(nomData[0].lat);
              const parsedLon = parseFloat(nomData[0].lon);
              if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
                targetLat = parsedLat;
                targetLon = parsedLon;
                cityLabel = nomData[0].display_name.split(',')[0] || trimmedCity;
                cacheSet(geoKey, { lat: targetLat, lon: targetLon, display: cityLabel }, 86_400_000);
              }
            }
          }
        } catch {
          // Continue to coordinate fallback
        }
      }
    }
  }

  // Default coordinate if neither geolocation nor city geocode succeeded
  if (typeof targetLat !== 'number' || !Number.isFinite(targetLat) || typeof targetLon !== 'number' || !Number.isFinite(targetLon)) {
    if (region.toUpperCase() === 'US') {
      targetLat = 40.7128;
      targetLon = -74.006; // New York
      if (!trimmedCity) cityLabel = 'New York';
      countryCode = 'US';
    } else {
      targetLat = 19.076;
      targetLon = 72.8777; // Mumbai
      if (!trimmedCity) cityLabel = 'Mumbai';
      countryCode = 'IN';
    }
  }

  const cacheKey = `theaters:v4:${targetLat.toFixed(2)}:${targetLon.toFixed(2)}`;
  const cachedEntry = cacheGet<{ cityLabel?: string; countryCode?: string; theaters: NearbyTheater[] }>(cacheKey);
  if (cachedEntry && Array.isArray(cachedEntry.theaters) && cachedEntry.theaters.length > 0) {
    const resolvedLabel =
      trimmedCity ? cityLabel : cachedEntry.cityLabel || cityLabel;
    const isSameGridPoint =
      cachedEntry.theaters.every((t) => t.distanceType === 'road') &&
      cachedEntry.theaters[0]?.lat !== undefined &&
      haversineDistance(targetLat, targetLon, Number(cacheKey.split(':')[2]), Number(cacheKey.split(':')[3])) < 0.25;
    const recalculated = isSameGridPoint
      ? cachedEntry.theaters
      : await enrichRoadDistances(
          targetLat,
          targetLon,
          cachedEntry.theaters.map((t) => ({
            ...t,
            distanceKm: haversineDistance(targetLat!, targetLon!, t.lat, t.lon),
          }))
        );
    recalculated.sort((a, b) => a.distanceKm - b.distanceKm);
    return {
      source: 'osm',
      cityLabel: resolvedLabel,
      countryCode: cachedEntry.countryCode || countryCode,
      coordinates: { lat: targetLat, lon: targetLon },
      locationMethod: hasExplicitGps && !trimmedCity ? 'gps' : 'city',
      theaters: recalculated,
    };
  }

  // Step 2: Query OpenStreetMap Nominatim POI search, Overpass nwr, and (for GPS) Photon reverse geocode in parallel
  try {
    if (didNetworkGeocode) {
      await new Promise((r) => setTimeout(r, 350));
    }
    const [nomSettled, overpassSettled, revGeoSettled] = await Promise.allSettled([
      fetchNominatimCinemas(targetLat, targetLon, cityLabel),
      fetchOverpassCinemas(targetLat, targetLon, cityLabel),
      hasExplicitGps && !trimmedCity ? reverseGeocodeCoords(targetLat, targetLon) : Promise.resolve(null),
    ]);

    const nomResult = nomSettled.status === 'fulfilled' ? nomSettled.value : { theaters: [] };
    const overpassList = overpassSettled.status === 'fulfilled' ? overpassSettled.value : [];
    const revGeo = revGeoSettled.status === 'fulfilled' ? revGeoSettled.value : null;

    countryCode = revGeo?.countryCode || nomResult.inferredCountry || countryCode;
    if (hasExplicitGps && !trimmedCity) {
      cityLabel = revGeo?.cityLabel || nomResult.inferredCity || cityLabel;
    } else if (!trimmedCity && nomResult.inferredCity) {
      cityLabel = nomResult.inferredCity;
    }

    const merged = mergeAndDeduplicateTheaters([nomResult.theaters, overpassList]);
    if (merged.length > 0) {
      const withRoadDist = await enrichRoadDistances(targetLat, targetLon, merged);
      cacheSet(cacheKey, { cityLabel, countryCode, theaters: withRoadDist }, 86_400_000); // 24-hour cache
      return {
        source: 'osm',
        cityLabel,
        countryCode,
        coordinates: { lat: targetLat, lon: targetLon },
        locationMethod: hasExplicitGps && !trimmedCity ? 'gps' : 'city',
        theaters: withRoadDist,
      };
    }
  } catch {
    // Live OSM endpoints unavailable — fall back cleanly below
  }

  // Step 3: Local curated fallback ONLY within 60km of resolved coordinates
  const fallbacks = getCuratedTheaters(region, targetLat, targetLon);
  return {
    source: 'curated',
    cityLabel,
    countryCode,
    coordinates: { lat: targetLat, lon: targetLon },
    locationMethod: hasExplicitGps && !trimmedCity ? 'gps' : 'city',
    theaters: fallbacks,
  };
}

export function getCuratedTheaters(region = 'IN', targetLat?: number, targetLon?: number): NearbyTheater[] {
  const hasCoords = typeof targetLat === 'number' && Number.isFinite(targetLat) && typeof targetLon === 'number' && Number.isFinite(targetLon);
  const lat = hasCoords ? targetLat! : region.toUpperCase() === 'US' ? 40.7128 : 19.076;
  const lon = hasCoords ? targetLon! : region.toUpperCase() === 'US' ? -74.006 : 72.8777;

  const allCurated = [...FALLBACK_THEATERS.in, ...FALLBACK_THEATERS.us];
  const nearby = allCurated
    .map((t) => ({
      ...t,
      distanceKm: haversineDistance(lat, lon, t.lat, t.lon),
    }))
    .filter((t) => t.distanceKm <= 60);

  nearby.sort((a, b) => a.distanceKm - b.distanceKm);
  return nearby;
}

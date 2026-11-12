import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/db';
import { detectLocationFromIp, findNearbyTheaters, getCuratedTheaters } from '../lib/fetchers/theaters';

test('Theaters: getCuratedTheaters only returns venues within 60km of target coordinates', () => {
  const mumbai = getCuratedTheaters('IN', 19.076, 72.8777);
  assert.ok(mumbai.length >= 3);
  assert.ok(mumbai.every((t) => t.distanceKm <= 60));
  assert.ok(mumbai.every((t) => t.address.includes('Mumbai')));

  const nyc = getCuratedTheaters('US', 40.7128, -74.006);
  assert.ok(nyc.length >= 4);
  assert.ok(nyc.every((t) => t.distanceKm <= 60));
  assert.ok(nyc.every((t) => t.address.includes('New York')));

  // Remote coordinates without curated hub entries return empty instead of 1000+ km mismatches
  const midOcean = getCuratedTheaters('US', 0, 0);
  assert.equal(midOcean.length, 0);
});

test('Theaters: findNearbyTheaters parses Nominatim & Overpass nwr cinemas, filters roads, sorts & deduplicates', async () => {
  db().prepare("DELETE FROM api_cache WHERE cache_key IN ('theaters:v4:23.03:72.57', 'revgeo:v1:23.03:72.57')").run();

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('photon.komoot.io/reverse')) {
      return new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                district: 'Navrangpura',
                city: 'Ahmedabad',
                countrycode: 'IN',
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url.includes('nominatim.openstreetmap.org')) {
      return new Response(
        JSON.stringify([
          {
            osm_type: 'node',
            osm_id: 101,
            category: 'highway',
            type: 'tertiary',
            name: 'Cinema Road Overpass',
            lat: '23.025',
            lon: '72.575',
          },
          {
            osm_type: 'way',
            osm_id: 202,
            category: 'amenity',
            type: 'cinema',
            name: 'PVR Acropolis Mall',
            lat: '23.0497',
            lon: '72.5177',
            address: {
              road: 'Sarkhej Gandhinagar Highway',
              suburb: 'Thaltej',
              city: 'Ahmedabad',
              postcode: '380054',
            },
            extratags: {
              brand: 'PVR',
              website: 'www.pvrcinemas.com',
            },
          },
          {
            osm_type: 'node',
            osm_id: 203,
            category: 'amenity',
            type: 'cinema',
            name: 'City Gold Multiplex',
            lat: '23.0285',
            lon: '72.5701',
            address: {
              road: 'Ashram Road',
              suburb: 'Navrangpura',
              city: 'Ahmedabad',
            },
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url.includes('overpass-api.de')) {
      return new Response(
        JSON.stringify({
          elements: [
            {
              id: 303,
              type: 'way',
              center: { lat: 23.0497, lon: 72.5177 },
              tags: {
                amenity: 'cinema',
                name: 'PVR Acropolis Mall',
                'addr:city': 'Ahmedabad',
              },
            },
            {
              id: 304,
              type: 'relation',
              center: { lat: 23.0301, lon: 72.5612 },
              tags: {
                amenity: 'cinema',
                name: 'Sunset Drive-In Cinema',
                'addr:street': 'Drive In Road',
                'addr:city': 'Ahmedabad',
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url.includes('router.project-osrm.org')) {
      return new Response(
        JSON.stringify({
          code: 'Ok',
          distances: [[0, 420, 2100, 8400]],
          durations: [[0, 95, 360, 1080]],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const res = await findNearbyTheaters(23.0261, 72.5714, undefined, 'US');
    assert.equal(res.source, 'osm');
    assert.equal(res.locationMethod, 'gps');
    assert.equal(res.countryCode, 'IN');
    assert.equal(res.cityLabel, 'Navrangpura, Ahmedabad');
    assert.equal(res.theaters.length, 3);
    assert.equal(res.theaters[0].name, 'City Gold Multiplex');
    assert.equal(res.theaters[0].distanceType, 'road');
    assert.equal(res.theaters[0].distanceKm, 0.4);
    assert.equal(res.theaters[0].driveMinutes, 2);
    assert.ok(res.theaters[0].distanceKm <= res.theaters[1].distanceKm);
    const pvr = res.theaters.find((t) => t.name === 'PVR Acropolis Mall');
    assert.ok(pvr);
    assert.equal(pvr.chain, 'PVR INOX');
    assert.equal(pvr.website, 'https://www.pvrcinemas.com');
    assert.ok(pvr.address.includes('Thaltej'));

    // Cached repeat GPS lookup must still retain real area label instead of 'Current Location'
    const cachedRepeat = await findNearbyTheaters(23.0261, 72.5714, undefined, 'US');
    assert.equal(cachedRepeat.cityLabel, 'Navrangpura, Ahmedabad');
    assert.equal(cachedRepeat.countryCode, 'IN');
    assert.equal(cachedRepeat.locationMethod, 'gps');
  } finally {
    db().prepare("DELETE FROM api_cache WHERE cache_key IN ('theaters:v4:23.03:72.57', 'revgeo:v1:23.03:72.57')").run();
    globalThis.fetch = origFetch;
  }
});

test('Theaters: detectLocationFromIp falls back across providers cleanly', async () => {
  db().prepare("DELETE FROM api_cache WHERE cache_key = 'ipgeo:v1:203.0.113.5'").run();
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('ipinfo.io')) {
      return new Response('rate limited', { status: 429 });
    }
    if (url.includes('ipapi.co')) {
      return new Response(
        JSON.stringify({ city: 'Bengaluru', country_code: 'IN', latitude: 12.9716, longitude: 77.5946 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }) as typeof fetch;

  try {
    const geo = await detectLocationFromIp('203.0.113.5');
    assert.ok(geo);
    assert.equal(geo.cityLabel, 'Bengaluru');
    assert.equal(geo.countryCode, 'IN');
    assert.equal(geo.lat, 12.9716);
    assert.equal(geo.lon, 77.5946);
  } finally {
    db().prepare("DELETE FROM api_cache WHERE cache_key = 'ipgeo:v1:203.0.113.5'").run();
    globalThis.fetch = origFetch;
  }
});

test('Theaters: offline fallback never returns faraway city venues for an unmatched location', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('Network offline');
  }) as typeof fetch;

  try {
    const jaipur = await findNearbyTheaters(undefined, undefined, 'Jaipur', 'IN');
    assert.equal(jaipur.source, 'curated');
    assert.equal(jaipur.cityLabel, 'Jaipur');
    // Must not inject Mumbai/Delhi cinemas 250-1100km away into Jaipur
    assert.equal(jaipur.theaters.length, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

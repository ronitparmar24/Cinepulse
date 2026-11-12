'use client';
import { useState, useEffect, useRef } from 'react';
import { Compass, MapPin, Navigation, ExternalLink, Search, Popcorn, RotateCcw } from 'lucide-react';
import { api } from './client';
import { Modal } from './UI';
import { useApp } from './Context';

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

const QUICK_CITIES_BY_REGION: Record<'IN' | 'US', string[]> = {
  IN: ['Mumbai', 'New Delhi', 'Bengaluru', 'Ahmedabad', 'Hyderabad', 'Pune'],
  US: ['New York', 'Los Angeles', 'Chicago', 'San Francisco', 'London'],
};

const IN_CITY_HINTS = new Set(['mumbai', 'new delhi', 'delhi', 'bengaluru', 'bangalore', 'ahmedabad', 'hyderabad', 'pune', 'chennai', 'kolkata', 'jaipur', 'surat', 'kochi']);

interface FetchOpts {
  lat?: number;
  lon?: number;
  city?: string;
  autoLocate?: boolean;
  accuracyMeters?: number | null;
}

export function NearbyTheatersModal({ onClose }: { onClose: () => void }) {
  const { region } = useApp();
  const activeRegion = region === 'US' ? 'US' : 'IN';
  const defaultCity = activeRegion === 'US' ? 'New York' : 'Mumbai';

  const [cityInput, setCityInput] = useState('');
  const [activeCity, setActiveCity] = useState(defaultCity);
  const [theaters, setTheaters] = useState<NearbyTheater[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationMethod, setLocationMethod] = useState<'gps' | 'ip' | 'city'>('city');
  const [countryCode, setCountryCode] = useState<string | undefined>(activeRegion);
  const [geoNotice, setGeoNotice] = useState('');
  const [source, setSource] = useState<'osm' | 'curated'>('osm');
  const reqSeqRef = useRef(0);

  function fetchTheaters(opts: FetchOpts) {
    const reqId = ++reqSeqRef.current;
    setLoading(true);
    setGeoNotice('');
    setGpsAccuracy(opts.accuracyMeters ?? null);

    const params = new URLSearchParams();
    if (typeof opts.lat === 'number' && typeof opts.lon === 'number') {
      params.set('lat', String(opts.lat));
      params.set('lon', String(opts.lon));
    }
    if (opts.city) params.set('city', opts.city);
    if (opts.autoLocate) params.set('autoLocate', '1');
    params.set('region', activeRegion);

    api<{
      source: 'osm' | 'curated';
      cityLabel: string;
      theaters: NearbyTheater[];
      countryCode?: string;
      locationMethod?: 'gps' | 'ip' | 'city';
      coordinates?: { lat: number; lon: number };
    }>(`/theaters/nearby?${params.toString()}`, 'GET')
      .then((res) => {
        if (reqId !== reqSeqRef.current) return;
        setTheaters(res.theaters || []);
        setSource(res.source || 'curated');
        if (res.cityLabel) setActiveCity(res.cityLabel);
        if (res.countryCode) setCountryCode(res.countryCode);
        if (res.coordinates) setCoords(res.coordinates);
        setLocationMethod(res.locationMethod || (opts.lat !== undefined ? 'gps' : 'city'));
        if (opts.autoLocate && res.locationMethod !== 'ip') {
          setGeoNotice('Could not determine device location automatically — showing regional default.');
        }
      })
      .catch(() => {
        if (reqId !== reqSeqRef.current) return;
        setTheaters([]);
        setSource('curated');
      })
      .finally(() => {
        if (reqId === reqSeqRef.current) setLoading(false);
      });
  }

  useEffect(() => {
    setCountryCode(activeRegion);
    setActiveCity(defaultCity);
    fetchTheaters({ city: defaultCity });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegion]);

  function handleUseLocation() {
    setLocating(true);
    setGeoNotice('');

    const fallbackToIpGeo = () => {
      setLocating(false);
      fetchTheaters({ autoLocate: true });
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      fallbackToIpGeo();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setActiveCity('Locating area…');
        fetchTheaters({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      () => {
        // Browser GPS denied/unavailable/timed out -> seamlessly fall back to network IP geolocation
        fallbackToIpGeo();
      },
      { enableHighAccuracy: false, timeout: 4500, maximumAge: 300_000 }
    );
  }

  function handleCitySearch(e: React.FormEvent) {
    e.preventDefault();
    const target = cityInput.trim();
    if (!target) return;
    setActiveCity(target);
    if (IN_CITY_HINTS.has(target.toLowerCase())) setCountryCode('IN');
    else setCountryCode(undefined);
    fetchTheaters({ city: target });
    setCityInput('');
  }

  function handleQuickCity(city: string) {
    setActiveCity(city);
    fetchTheaters({ city });
  }

  const chipGroup: 'IN' | 'US' =
    countryCode === 'IN' || IN_CITY_HINTS.has(activeCity.toLowerCase()) ? 'IN' : countryCode === 'US' || countryCode === 'GB' ? 'US' : activeRegion;
  const quickCities = QUICK_CITIES_BY_REGION[chipGroup];
  const googleMapsSearchUrl = coords && locationMethod !== 'city'
    ? `https://www.google.com/maps/search/cinemas/@${coords.lat},${coords.lon},13z`
    : `https://www.google.com/maps/search/cinemas+near+${encodeURIComponent(activeCity)}`;

  const radarStatusLabel = locating
    ? 'ACQUIRING LOCATION'
    : loading
    ? 'SCANNING'
    : source === 'osm' && theaters.length > 0
    ? locationMethod === 'gps'
      ? 'OPENSTREETMAP LIVE · GPS LOCKED'
      : locationMethod === 'ip'
      ? 'OPENSTREETMAP LIVE · AUTO-LOCATED'
      : 'OPENSTREETMAP LIVE'
    : 'LOCAL DIRECTORY';

  return (
    <Modal label="Find Cinemas Near You" onClose={onClose}>
      <div className="pad-card" style={{ padding: '24px', maxWidth: 660 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span className="eyebrow mint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Popcorn size={13} /> THEATRICAL RADAR · {radarStatusLabel}
            </span>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0' }}>Cinemas Near {activeCity}</h2>
          </div>
        </div>

        {/* Search & Location Bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <form onSubmit={handleCitySearch} style={{ display: 'flex', flex: 1, gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search city (e.g. Mumbai, Ahmedabad, London, New York)..."
                aria-label="Search city for nearby cinemas"
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: 13,
                }}
              />
            </div>
            <button type="submit" className="button primary small" style={{ minWidth: 70 }}>
              Search
            </button>
          </form>

          <button
            type="button"
            className={`button small ${locationMethod !== 'city' ? 'primary' : 'glass'}`}
            onClick={handleUseLocation}
            disabled={locating}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            title="Detect your live location (GPS with automatic ISP fallback)"
          >
            <Navigation size={13} className={locating ? 'spin' : locationMethod !== 'city' ? '' : 'mint'} />
            <span>{locating ? 'Locating…' : 'GPS'}</span>
          </button>
        </div>

        {/* Quick city chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {quickCities.map((c) => {
            const isActive = activeCity.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                className={`trailer-filter-chip ${isActive ? 'active' : ''}`}
                onClick={() => handleQuickCity(c)}
              >
                {c}
              </button>
            );
          })}
        </div>

        {/* Source & Verification Status */}
        <div
          style={{
            fontSize: 11.5,
            color: '#94a3b8',
            marginBottom: 16,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>
            {locating
              ? 'Requesting device GPS location…'
              : loading
              ? `Scanning OpenStreetMap cinema venues near ${activeCity}…`
              : locationMethod === 'gps' && coords
              ? `GPS fix (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}${
                  gpsAccuracy ? `, ±${Math.round(gpsAccuracy)}m` : ''
                }) · ${theaters.length} verified cinema${theaters.length === 1 ? '' : 's'} sorted by distance.`
              : locationMethod === 'ip' && coords
              ? `Browser GPS unavailable — using ISP network hub near ${activeCity} (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(
                  2
                )}). Open localhost or HTTPS for meter-accurate distances.`
              : source === 'osm' && theaters.length > 0
              ? `Live OpenStreetMap scan · ${theaters.length} verified cinema${theaters.length === 1 ? '' : 's'} sorted by distance from ${activeCity}. Check official sites for live showtimes.`
              : theaters.length > 0
              ? `Live OpenStreetMap scan was busy — showing ${theaters.length} verified local directory cinemas near ${activeCity}.`
              : `No mapped cinemas returned for ${activeCity} within 25 km.`}
            {geoNotice ? ` ${geoNotice}` : ''}
          </span>
          <a
            href={googleMapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--neon-mint)',
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>Google Maps</span>
            <ExternalLink size={10} />
          </a>
        </div>

        {/* Theater List */}
        {locating || loading ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
            <div className="spin" style={{ display: 'inline-block', marginBottom: 8 }}>
              <Compass size={24} className="mint" />
            </div>
            <p style={{ fontSize: 13 }}>
              {locating ? 'Locking onto your current coordinates…' : `Scanning real cinema locations around ${activeCity}…`}
            </p>
          </div>
        ) : theaters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              Could not locate mapped cinemas around {activeCity}. Try a nearby metro or open Google Maps directly.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="button glass small"
                onClick={() => fetchTheaters({ city: activeCity })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RotateCcw size={12} />
                <span>Retry Scan</span>
              </button>
              <a
                href={googleMapsSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button primary small"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>Search Google Maps</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '380px', overflowY: 'auto', paddingRight: 4 }}>
            {theaters.map((th) => {
              const mapUrl =
                locationMethod === 'gps' && coords
                  ? `https://www.google.com/maps/dir/?api=1&origin=${coords.lat},${coords.lon}&destination=${th.lat},${th.lon}`
                  : `https://www.google.com/maps/search/?api=1&query=${th.lat},${th.lon}`;
              const distLabel =
                locationMethod === 'gps'
                  ? `${th.distanceKm} km${th.distanceType === 'road' ? ' drive' : ' away'}`
                  : `${th.distanceKm} km from center`;
              return (
                <div
                  key={th.id}
                  className="glass"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 650, color: '#f1f5f9' }}>{th.name}</h4>
                      {th.chain && (
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 750,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(0, 245, 155, 0.12)',
                            color: 'var(--neon-mint)',
                          }}
                        >
                          {th.chain}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
                      <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {th.address} · <strong style={{ color: '#e2e8f0' }}>{distLabel}</strong>
                      {th.driveMinutes ? <span style={{ color: '#94a3b8' }}> (~{th.driveMinutes} min)</span> : null}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button glass small"
                      style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      aria-label={`View ${th.name} in Google Maps`}
                      title={locationMethod === 'gps' ? 'Get directions in Google Maps' : 'Open exact cinema pin in Google Maps'}
                    >
                      <MapPin size={11} className="mint" />
                      <span>Map</span>
                    </a>
                    {th.website ? (
                      <a
                        href={th.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button glass small"
                        style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <span>Website</span>
                        <ExternalLink size={11} />
                      </a>
                    ) : (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(th.name + ' ' + activeCity + ' showtimes')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button glass small"
                        style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        <span>Showtimes</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

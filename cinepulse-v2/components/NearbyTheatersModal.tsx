'use client';
import { useState, useEffect } from 'react';
import { Compass, MapPin, Navigation, ExternalLink, Search, Sparkles, Popcorn, X } from 'lucide-react';
import { api } from './client';
import { Modal } from './UI';
import { useApp } from './Context';

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

export function NearbyTheatersModal({ onClose }: { onClose: () => void }) {
  const { region } = useApp();
  const [cityInput, setCityInput] = useState('');
  const [activeCity, setActiveCity] = useState(region === 'IN' ? 'Mumbai' : 'New York');
  const [theaters, setTheaters] = useState<NearbyTheater[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [source, setSource] = useState<'osm' | 'curated'>('osm');

  function fetchTheaters(lat?: number, lon?: number, city?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (lat && lon) {
      params.set('lat', String(lat));
      params.set('lon', String(lon));
    }
    if (city) params.set('city', city);
    params.set('region', region || 'IN');

    api<{ source: 'osm' | 'curated'; cityLabel: string; theaters: NearbyTheater[] }>(
      `/theaters/nearby?${params.toString()}`,
      'GET'
    )
      .then((res) => {
        setTheaters(res.theaters || []);
        setSource(res.source);
        if (res.cityLabel) setActiveCity(res.cityLabel);
      })
      .catch(() => setTheaters([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchTheaters(undefined, undefined, activeCity);
  }, []);

  function handleUseLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setActiveCity('Current Location');
        fetchTheaters(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        fetchTheaters(undefined, undefined, activeCity);
      },
      { timeout: 8000 }
    );
  }

  function handleCitySearch(e: React.FormEvent) {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setActiveCity(cityInput.trim());
    fetchTheaters(undefined, undefined, cityInput.trim());
    setCityInput('');
  }

  return (
    <Modal label="Find Cinemas Near You" onClose={onClose}>
      <div className="pad-card" style={{ padding: '24px', maxWidth: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span className="eyebrow mint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Popcorn size={13} /> THEATRICAL RADAR · OPENSTREETMAP
            </span>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0' }}>Cinemas Near {activeCity}</h2>
          </div>
        </div>

        {/* Search & Location Bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <form onSubmit={handleCitySearch} style={{ display: 'flex', flex: 1, gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search city (e.g. Mumbai, Delhi, London, NYC)..."
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
            className="button glass small"
            onClick={handleUseLocation}
            disabled={locating}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            title="Use browser GPS geolocation"
          >
            <Navigation size={13} className={locating ? 'spin' : 'mint'} />
            <span>{locating ? 'Locating…' : 'GPS'}</span>
          </button>
        </div>

        {/* Notice of Source & Showtimes */}
        <div
          style={{
            fontSize: 11,
            color: '#94a3b8',
            marginBottom: 16,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          📍 Verified locations via {source === 'osm' ? 'OpenStreetMap Overpass' : 'Regional Cinema Directory'}. Check cinema sites directly for ticket booking and live showtimes.
        </div>

        {/* Theater List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
            <div className="spin" style={{ display: 'inline-block', marginBottom: 8 }}>
              <Compass size={24} className="mint" />
            </div>
            <p style={{ fontSize: 13 }}>Scanning cinemas within 15km…</p>
          </div>
        ) : theaters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
            <p>No cinemas found around {activeCity}. Try typing a larger neighboring city.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '380px', overflowY: 'auto' }}>
            {theaters.map((th) => (
              <div
                key={th.id}
                className="glass"
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 650, color: '#f1f5f9' }}>{th.name}</h4>
                    {th.chain && (
                      <span
                        style={{
                          fontSize: 9,
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
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                    <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    {th.address} · <strong style={{ color: '#cbd5e1' }}>{th.distanceKm} km away</strong>
                  </div>
                </div>

                {th.website ? (
                  <a
                    href={th.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button glass small"
                    style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                  >
                    <span>Website</span>
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(th.name + ' showtimes')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button glass small"
                    style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                  >
                    <span>Showtimes</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

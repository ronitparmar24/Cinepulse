'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useApp } from './Context';
import { openWrapped, wrappedSeason, wrappedYear } from '@/lib/wrappedClient';

/** Home banner for signed-in members from mid-November to January; dismissible per year. */
export function WrappedTeaser() {
  const { user } = useApp();
  const [visible, setVisible] = useState(false);
  const year = wrappedYear();
  const key = `cinepulse_wrapped_teaser_${year}`;

  useEffect(() => {
    if (!user || !wrappedSeason()) { setVisible(false); return; }
    let dismissed = false;
    try { dismissed = localStorage.getItem(key) === '1'; } catch {}
    setVisible(!dismissed);
  }, [user, key]);

  if (!visible) return null;
  const dismiss = () => {
    try { localStorage.setItem(key, '1'); } catch {}
    setVisible(false);
  };

  return (
    <div className="wrapped-teaser" role="region" aria-label={`${year} Wrapped`}>
      <button type="button" className="wrapped-teaser-main" onClick={openWrapped}>
        <span className="wrapped-teaser-orb" aria-hidden="true"><Sparkles size={20} /></span>
        <span className="wrapped-teaser-text">
          <small>CinePulse Wrapped</small>
          <b>Your {year} in film is ready</b>
        </span>
        <span className="wrapped-teaser-cta">Watch <ArrowRight size={15} /></span>
      </button>
      <button type="button" className="wrapped-teaser-close" onClick={dismiss} aria-label="Hide the Wrapped banner"><X size={15} /></button>
    </div>
  );
}

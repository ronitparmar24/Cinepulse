'use client';
/**
 * "Surprise me": picks a title from what is on screen (skipping ones already watched or just
 * opened), spins a short poster reel that decelerates onto the pick, then opens it.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Shuffle, Sparkles } from 'lucide-react';
import type { Title } from '@/lib/types';
import { useApp } from './Context';
import { useReducedMotion } from './hooks/useReducedMotion';
import { readRecent } from '@/lib/recentlyViewed';

const REEL_LENGTH = 14;
const SPIN_MS = 1700;
const HOLD_MS = 650;

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function SurpriseMe({ titles }: { titles: Title[] }) {
  const { openTitle, library } = useApp();
  const reduced = useReducedMotion();
  const [spin, setSpin] = useState<{ reel: Title[]; pick: Title; landed: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const pool = titles.filter((t) => t.poster);
  if (pool.length < 4) return null;

  function start() {
    const watched = new Set(library.filter((e) => e.status === 'watched').map((e) => e.title.id));
    const recent = new Set(readRecent().slice(0, 4).map((r) => r.id));
    const fresh = pool.filter((t) => !watched.has(t.id) && !recent.has(t.id));
    const candidates = fresh.length > 0 ? fresh : pool;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (reduced) {
      openTitle(pick.id);
      return;
    }
    const others = shuffle(pool.filter((t) => t.id !== pick.id));
    const reel: Title[] = [];
    for (let i = 0; reel.length < REEL_LENGTH - 1; i++) reel.push(others[i % others.length]);
    reel.push(pick);
    setSpin({ reel, pick, landed: false });
    timers.current.push(
      window.setTimeout(() => setSpin((s) => (s ? { ...s, landed: true } : s)), SPIN_MS),
      window.setTimeout(() => {
        setSpin(null);
        openTitle(pick.id);
      }, SPIN_MS + HOLD_MS),
    );
  }

  function cancel() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setSpin(null);
  }

  return (
    <>
      <button type="button" className="surprise-btn" onClick={start} disabled={!!spin}>
        <Shuffle size={14} aria-hidden="true" />
        <span>Surprise me</span>
      </button>
      {spin &&
        createPortal(
          <div className={`surprise-overlay ${spin.landed ? 'is-landed' : ''}`} role="status" aria-live="polite" onClick={cancel}>
            <div className="surprise-stage" onClick={(e) => e.stopPropagation()}>
              <span className="eyebrow"><Sparkles size={12} aria-hidden="true" /> {spin.landed ? "TONIGHT'S PICK" : 'SHUFFLING THE SHELF'}</span>
              <div className="surprise-window">
                <div
                  className="surprise-reel"
                  style={{ '--reel-steps': spin.reel.length - 1, '--spin-ms': `${SPIN_MS}ms` } as CSSProperties}
                >
                  {spin.reel.map((t, i) => (
                    <img key={`${t.id}-${i}`} src={t.poster!.replace('/w500/', '/w342/')} alt="" decoding="async" />
                  ))}
                </div>
              </div>
              <b className="surprise-title">{spin.landed ? spin.pick.title : '…'}</b>
              <button type="button" className="surprise-cancel" onClick={cancel}>Cancel</button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

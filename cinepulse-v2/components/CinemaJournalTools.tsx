'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Timer,
  Moon,
  Play,
  Film,
  Clapperboard,
  Check,
  Edit3,
  Calendar,
  ChevronRight,
  Star,
} from 'lucide-react';
import type { Title } from '@/lib/types';
import { useApp } from './Context';
import { api } from './client';

// ─── 1. Smart Screening Clock & Runtime Calculator ─────────────────────────────
export interface ScreeningSchedulerProps {
  runtime: number | null;
  titleName: string;
}

export function ScreeningScheduler({ runtime, titleName }: ScreeningSchedulerProps) {
  const [offsetMinutes, setOffsetMinutes] = useState<number>(0);
  const [now, setNow] = useState<Date>(() => new Date());

  // Keep current time ticking every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const hasRuntime = typeof runtime === 'number' && runtime > 0;
  const effectiveRuntime = hasRuntime ? runtime : 120; // 2h fallback estimate

  const hours = Math.floor(effectiveRuntime / 60);
  const mins = effectiveRuntime % 60;

  const startTime = new Date(now.getTime() + offsetMinutes * 60000);
  const finishTime = new Date(startTime.getTime() + effectiveRuntime * 60000);
  const intermissionTime = new Date(startTime.getTime() + Math.floor(effectiveRuntime / 2) * 60000);

  function formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const isCrossMidnight = finishTime.getDate() !== startTime.getDate();

  return (
    <div
      className="screening-scheduler"
      style={{
        marginTop: 16,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01))',
        border: '1px solid rgba(224, 243, 241, 0.12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span
          className="eyebrow mint"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            letterSpacing: '0.08em',
            fontWeight: 800,
          }}
        >
          <Clock size={12} /> SCREENING RUNTIME & FINISH CLOCK
        </span>
        <span
          style={{
            fontSize: 10,
            color: hasRuntime ? '#34d399' : '#94a3b8',
            fontWeight: 600,
          }}
        >
          {hasRuntime ? `${hours}h ${mins}m (${runtime}m)` : 'Estimated ~2h'}
        </span>
      </div>

      {/* Main Finish-Time Highlight */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          background: 'rgba(0, 0, 0, 0.28)',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted, #94a3b8)' }}>
            {offsetMinutes === 0 ? 'If you start now' : `Planned start at ${formatTime(startTime)}`}:
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: '#b3f3d5',
              letterSpacing: '-0.02em',
              marginTop: 2,
            }}
          >
            Finishes at {formatTime(finishTime)}
          </div>
        </div>

        {/* Start Time / Offset selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { label: 'Now', val: 0 },
            { label: '+15m', val: 15 },
            { label: '+30m', val: 30 },
            { label: '+1h', val: 60 },
          ].map((btn) => (
            <button
              key={btn.val}
              type="button"
              onClick={() => setOffsetMinutes(btn.val)}
              style={{
                fontSize: 10,
                padding: '4px 7px',
                borderRadius: 5,
                fontWeight: 700,
                background:
                  offsetMinutes === btn.val
                    ? 'rgba(179, 243, 213, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                color: offsetMinutes === btn.val ? '#b3f3d5' : 'var(--muted, #94a3b8)',
                border:
                  offsetMinutes === btn.val
                    ? '1px solid rgba(179, 243, 213, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Midway Intermission and Midnight Alert */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          marginTop: 10,
          fontSize: 11,
          color: 'var(--muted, #94a3b8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Timer size={12} className="mint" style={{ flexShrink: 0 }} />
          <span>
            Halfway pause mark:{' '}
            <strong style={{ color: '#f1f5f9' }}>
              {Math.floor(effectiveRuntime / 2)}m
            </strong>{' '}
            (approx. {formatTime(intermissionTime)})
          </span>
        </div>

        {isCrossMidnight && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#fbbf24',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            <Moon size={12} style={{ flexShrink: 0 }} />
            <span>Crosses midnight into tomorrow</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 2. Interactive Private Screening Diary & Notes ────────────────────────────
export interface PrivateScreeningNotesProps {
  titleId: string;
  titleName: string;
  initialRating: number | null;
  onLogDiary: (rating: number, note: string, date: string) => Promise<void>;
  saving: boolean;
}

export function PrivateScreeningNotes({
  titleId,
  titleName,
  initialRating,
  onLogDiary,
  saving,
}: PrivateScreeningNotesProps) {
  const storageKey = `cinepulse_notes_${titleId}`;
  const [note, setNote] = useState<string>('');
  const [watchDate, setWatchDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [rating, setRating] = useState<number>(() => initialRating || 4);
  const [justSavedLocal, setJustSavedLocal] = useState<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load persisted note from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setNote(saved);
      }
    } catch {
      // Ignore local storage errors in private browsing
    }
  }, [storageKey]);

  useEffect(() => {
    if (initialRating) {
      setRating(initialRating);
    }
  }, [initialRating]);

  function handleNoteChange(val: string) {
    setNote(val);
    try {
      localStorage.setItem(storageKey, val);
      setJustSavedLocal(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setJustSavedLocal(false);
      }, 2000);
    } catch {
      // Storage full or unavailable
    }
  }

  async function handleDiarySubmit(e: React.FormEvent) {
    e.preventDefault();
    await onLogDiary(rating, note.trim(), watchDate);
  }

  return (
    <div
      className="private-notes-card"
      style={{
        marginTop: 14,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01))',
        border: '1px solid rgba(224, 243, 241, 0.12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          className="eyebrow mint"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            letterSpacing: '0.08em',
            fontWeight: 800,
          }}
        >
          <Edit3 size={12} /> PRIVATE SCREENING LOG & NOTES
        </span>

        {justSavedLocal && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: '#34d399',
              fontWeight: 600,
            }}
          >
            <Check size={11} /> Saved to device
          </span>
        )}
      </div>

      <textarea
        value={note}
        onChange={(e) => handleNoteChange(e.target.value)}
        placeholder="Personal viewing thoughts, memorable moments, or cinema notes…"
        rows={2}
        maxLength={500}
        style={{
          width: '100%',
          fontSize: 11,
          lineHeight: 1.5,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#f1f5f9',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />

      {/* Date & Quick Submit Row */}
      <form
        onSubmit={handleDiarySubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: 'var(--muted, #94a3b8)',
              margin: 0,
            }}
          >
            <Calendar size={11} />
            <input
              type="date"
              value={watchDate}
              onChange={(e) => setWatchDate(e.target.value)}
              style={{
                fontSize: 10,
                padding: '3px 6px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 5,
                color: '#f1f5f9',
              }}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="button primary small"
          style={{
            fontSize: 10,
            padding: '5px 12px',
            minHeight: 28,
            borderRadius: 6,
          }}
        >
          {saving ? 'Saving…' : 'Log to Diary'}
        </button>
      </form>
    </div>
  );
}

// ─── 3. Real Algorithmic TMDB Recommendations ("More Like This") ──────────────
export interface SimilarDiscoveriesProps {
  titleId: string;
}

export function SimilarDiscoveries({ titleId }: SimilarDiscoveriesProps) {
  const { openTitle } = useApp();
  const [items, setItems] = useState<Title[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    api<{ items: Title[] }>(`/similar/${titleId}`, 'GET', undefined, controller.signal)
      .then((res: { items: Title[] }) => {
        if (res && Array.isArray(res.items)) {
          // Take the top 3 similar titles
          setItems(res.items.slice(0, 3));
        } else {
          setItems([]);
        }
      })
      .catch((err: any) => {
        if (err?.name !== 'AbortError') {
          setItems([]);
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [titleId]);

  if (!loading && (!items || items.length === 0)) {
    return null;
  }

  return (
    <div
      className="similar-discoveries-box"
      style={{
        marginTop: 16,
        padding: '14px 16px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01))',
        border: '1px solid rgba(224, 243, 241, 0.12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span
          className="eyebrow mint"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            letterSpacing: '0.08em',
            fontWeight: 800,
          }}
        >
          <Film size={12} /> MORE LIKE THIS · SIMILAR TITLES
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted, #94a3b8)' }}>
          TMDB Discovery
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          // Loading skeletons
          [1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                height: 52,
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.03)',
                animation: 'pulse 1.5s infinite ease-in-out',
              }}
            />
          ))
        ) : (
          items?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openTitle(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 8px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                width: '100%',
                color: 'inherit',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)';
                e.currentTarget.style.borderColor = 'rgba(179, 243, 213, 0.25)';
                e.currentTarget.style.transform = 'translateX(2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              {/* Poster Thumbnail */}
              <div
                style={{
                  width: 36,
                  height: 50,
                  borderRadius: 5,
                  overflow: 'hidden',
                  background: '#1a2420',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Clapperboard size={14} style={{ color: 'var(--muted, #94a3b8)' }} />
                )}
              </div>

              {/* Title & Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#f1f5f9',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--muted, #94a3b8)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <span>{item.releaseDate?.slice(0, 4) || 'TBA'}</span>
                  {item.voteAverage !== null && item.voteAverage > 0 && (
                    <span style={{ color: '#b3f3d5', fontWeight: 600 }}>
                      ★ {item.voteAverage.toFixed(1)}
                    </span>
                  )}
                  {item.genres?.length > 0 && (
                    <span style={{ opacity: 0.8 }}>· {item.genres[0]}</span>
                  )}
                </div>
              </div>

              <ChevronRight
                size={14}
                style={{
                  color: 'var(--muted, #94a3b8)',
                  flexShrink: 0,
                  opacity: 0.6,
                }}
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

'use client';
import { useState, type KeyboardEvent } from 'react';
import { ratingLabel } from '@/lib/rating';

/**
 * Half-star rating input. Click the left or right half of a star; or focus it and use the
 * arrow keys (½ star per press), Home/End, and Delete/Backspace to clear. Exposed as a slider.
 */
export function StarRating({
  value,
  onChange,
  disabled = false,
  size = 26,
  label = 'Your rating',
  allowClear = true,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  size?: number;
  label?: string;
  allowClear?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  function set(next: number) {
    if (disabled) return;
    const clamped = Math.max(allowClear ? 0 : 0.5, Math.min(5, Math.round(next * 2) / 2));
    onChange(allowClear && clamped === value ? 0 : clamped);
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, number> = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 };
    if (e.key in step) { e.preventDefault(); onChange(Math.max(allowClear ? 0 : 0.5, Math.min(5, (value || 0) + step[e.key]))); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(0.5); }
    else if (e.key === 'End') { e.preventDefault(); onChange(5); }
    else if (allowClear && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); onChange(0); }
  }

  return (
    <div
      className={`star-rating${disabled ? ' is-disabled' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0.5}
      aria-valuemax={5}
      aria-valuenow={value || undefined}
      aria-valuetext={value ? ratingLabel(value) : 'Not rated'}
      aria-disabled={disabled || undefined}
      onKeyDown={onKey}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = shown >= star ? 1 : shown >= star - 0.5 ? 0.5 : 0;
        return (
          <span key={star} className="star-rating-star" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
              <defs>
                <linearGradient id={`sr-${star}-${fill}`}>
                  <stop offset={fill === 1 ? '100%' : fill === 0.5 ? '50%' : '0%'} stopColor="currentColor" />
                  <stop offset={fill === 1 ? '100%' : fill === 0.5 ? '50%' : '0%'} stopColor="transparent" />
                </linearGradient>
              </defs>
              <path d="M12 2.5l2.94 6.08 6.56.95-4.75 4.62 1.12 6.53L12 17.6l-5.87 3.08 1.12-6.53L2.5 9.53l6.56-.95z" fill={`url(#sr-${star}-${fill})`} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {/* Two invisible hit areas: left half = n−½, right half = n. Pointer-only (mousedown is prevented so
                they never take focus inside aria-hidden); keyboard uses the slider. */}
            <button type="button" tabIndex={-1} aria-hidden="true" disabled={disabled} className="star-rating-hit left" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHover(star - 0.5)} onClick={() => set(star - 0.5)} />
            <button type="button" tabIndex={-1} aria-hidden="true" disabled={disabled} className="star-rating-hit right" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHover(star)} onClick={() => set(star)} />
          </span>
        );
      })}
    </div>
  );
}

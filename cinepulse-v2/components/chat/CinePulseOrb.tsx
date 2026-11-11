'use client';

import React from 'react';

export type OrbState = 'idle' | 'thinking' | 'streaming';
export type OrbSize = 'xs' | 'sm' | 'md' | 'lg';

export function CinePulseOrb({
  state = 'idle',
  size = 'sm',
  className = '',
}: {
  state?: OrbState;
  size?: OrbSize;
  className?: string;
}) {
  const px = size === 'xs' ? 18 : size === 'sm' ? 24 : size === 'md' ? 36 : 52;
  const uid = React.useId().replace(/:/g, '');

  return (
    <span
      className={`cp-orb cp-orb--${state} cp-orb--${size} ${className}`.trim()}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <span className="cp-orb__ripple cp-orb__ripple--1" />
      <span className="cp-orb__ripple cp-orb__ripple--2" />

      <svg
        viewBox="0 0 64 64"
        width={px}
        height={px}
        fill="none"
        className="cp-orb__svg"
      >
        <defs>
          <linearGradient id={`cp-mint-${uid}`} x1="8%" y1="8%" x2="92%" y2="92%">
            <stop offset="0%" stopColor="#e8fff4" />
            <stop offset="52%" stopColor="#b3f3d5" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <radialGradient id={`cp-core-${uid}`} cx="40%" cy="36%" r="64%">
            <stop offset="0%" stopColor="#f0fff8" />
            <stop offset="48%" stopColor="#b3f3d5" />
            <stop offset="100%" stopColor="#10b981" />
          </radialGradient>
        </defs>

        {/* Minimal outer precision aperture arc */}
        <g className="cp-orb__outer-ring">
          <circle
            cx="32"
            cy="32"
            r="27"
            stroke={`url(#cp-mint-${uid})`}
            strokeWidth="1.35"
            strokeOpacity="0.48"
            strokeDasharray="24 10 12 10"
            strokeLinecap="round"
          />
          <circle cx="32" cy="5" r="1.5" fill="#b3f3d5" fillOpacity="0.85" />
          <circle cx="32" cy="59" r="1.5" fill="#34d399" fillOpacity="0.75" />
        </g>

        {/* Inner iris ring */}
        <g className="cp-orb__inner-ring">
          <circle
            cx="32"
            cy="32"
            r="19.5"
            stroke="#b3f3d5"
            strokeWidth="1.25"
            strokeOpacity="0.62"
            strokeDasharray="18 8"
            strokeLinecap="round"
          />
        </g>

        {/* Central geometric aperture pulse star */}
        <g className="cp-orb__core">
          <path
            d="M32 17 L35.1 28.9 L47 32 L35.1 35.1 L32 47 L28.9 35.1 L17 32 L28.9 28.9 Z"
            fill={`url(#cp-core-${uid})`}
          />
          <circle cx="32" cy="32" r="4" fill="#0b0e12" />
          <circle cx="32" cy="32" r="1.7" fill="#b3f3d5" />
        </g>
      </svg>
    </span>
  );
}

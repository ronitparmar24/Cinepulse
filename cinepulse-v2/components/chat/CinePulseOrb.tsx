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
  const px = size === 'xs' ? 18 : size === 'sm' ? 26 : size === 'md' ? 38 : 64;
  const uid = React.useId().replace(/:/g, '');

  return (
    <span
      className={`cp-orb cp-orb--${state} cp-orb--${size} ${className}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      {/* Sonar burst rings for thinking / streaming */}
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
          <linearGradient id={`cp-gold-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#f5a623" />
            <stop offset="100%" stopColor="#e8488a" />
          </linearGradient>
          <radialGradient id={`cp-core-${uid}`} cx="42%" cy="38%" r="60%">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="45%" stopColor="#f5a623" />
            <stop offset="100%" stopColor="#be185d" />
          </radialGradient>
        </defs>

        {/* Outer rotating film-sprocket ring */}
        <g className="cp-orb__outer-ring">
          <circle
            cx="32"
            cy="32"
            r="27"
            stroke={`url(#cp-gold-${uid})`}
            strokeWidth="1.6"
            strokeOpacity="0.7"
            strokeDasharray="4 4.5"
            strokeLinecap="round"
          />
          {/* 4 precision projector cardinal notches */}
          <circle cx="32" cy="5" r="2" fill="#f5a623" />
          <circle cx="59" cy="32" r="1.6" fill="#e8488a" />
          <circle cx="32" cy="59" r="2" fill="#f5a623" />
          <circle cx="5" cy="32" r="1.6" fill="#e8488a" />
        </g>

        {/* Inner counter-rotating cinema aperture ring */}
        <g className="cp-orb__inner-ring">
          <circle
            cx="32"
            cy="32"
            r="19.5"
            stroke={`url(#cp-gold-${uid})`}
            strokeWidth="1.4"
            strokeOpacity="0.85"
            strokeDasharray="16 7 5 7"
            strokeLinecap="round"
          />
        </g>

        {/* Central 4-point cinema projector star + iris pupil */}
        <g className="cp-orb__core">
          <path
            d="M32 16.5 L35.2 28.8 L47.5 32 L35.2 35.2 L32 47.5 L28.8 35.2 L16.5 32 L28.8 28.8 Z"
            fill={`url(#cp-core-${uid})`}
          />
          <circle cx="32" cy="32" r="4.2" fill="#090b10" />
          <circle cx="32" cy="32" r="2" fill="#fde68a" />
        </g>
      </svg>
    </span>
  );
}

'use client';
import React from 'react';

interface AiBadgeProps {
  className?: string;
  style?: React.CSSProperties;
  size?: 'sm' | 'md';
}

/**
 * AI Badge - Mandatory disclosure pill for simulated critic personas.
 * Must be keyboard and screen-reader accessible with role="note" and explicit aria-label.
 */
export function AiBadge({ className = '', style, size = 'sm' }: AiBadgeProps) {
  const tooltipText = "Simulated critic persona. Opinions are generated, not from a real viewer.";
  return (
    <span
      className={`ai-badge ${size === 'md' ? 'ai-badge-md' : ''} ${className}`.trim()}
      role="note"
      tabIndex={0}
      aria-label={tooltipText}
      title={tooltipText}
      style={style}
    >
      AI
    </span>
  );
}

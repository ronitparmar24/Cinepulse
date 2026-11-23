'use client';
/** Floating "back to top" button with a reading-progress ring; appears after ~1.2 screens. */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const R = 19;
const C = 2 * Math.PI * R;

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const ringRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      setVisible(y > window.innerHeight * 1.2);
      if (ringRef.current && max > 0) ringRef.current.style.strokeDashoffset = String(C * (1 - Math.min(1, y / max)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <button
      type="button"
      className={`back-to-top ${visible ? 'is-visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={R} className="btt-track" />
        <circle cx="22" cy="22" r={R} className="btt-ring" ref={ringRef} style={{ strokeDasharray: C, strokeDashoffset: C }} />
      </svg>
      <ArrowUp size={17} />
    </button>
  );
}

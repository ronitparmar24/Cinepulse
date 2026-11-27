'use client';
/**
 * A short confetti burst on a throwaway full-screen canvas: two cannons from the bottom corners
 * plus a spray from `origin` (e.g. the winning poster). ~2.5 s, then the canvas removes itself.
 * Does nothing with prefers-reduced-motion. Returns a function that stops it early.
 */

const COLORS = ['#b3f3d5', '#eacb92', '#ffffff', '#7dd3fc', '#f9a8d4', '#fbbf24', '#86efac'];

interface Piece {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; w: number; h: number;
  color: string; round: boolean; wobble: number; life: number; age: number;
}

export function celebrate(origin?: HTMLElement | null): () => void {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'pl-confetti-canvas';
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '9990' });
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const pieces: Piece[] = [];
  const add = (x: number, y: number, angle: number, spread: number, speed: [number, number], n: number) => {
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-spread, spread);
      const v = rand(speed[0], speed[1]);
      pieces.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        rot: rand(0, Math.PI * 2), vr: rand(-0.3, 0.3),
        w: rand(6, 11), h: rand(8, 15),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        round: Math.random() < 0.25, wobble: rand(0, Math.PI * 2),
        life: rand(1.7, 2.6), age: 0,
      });
    }
  };
  const small = W < 600;
  const n = small ? 45 : 70;
  // Bottom-corner cannons aimed up and inwards.
  add(0, H, -Math.PI / 3, 0.35, [H * 0.022, H * 0.032], n);
  add(W, H, -Math.PI * 2 / 3, 0.35, [H * 0.022, H * 0.032], n);
  // Radial spray from the winner.
  const r = origin?.getBoundingClientRect();
  if (r && r.bottom > 0 && r.top < H) add(r.left + r.width / 2, r.top + r.height / 3, -Math.PI / 2, Math.PI, [4, 11], small ? 30 : 50);

  let raf = 0;
  let last = performance.now();
  const started = last;
  const stop = () => { cancelAnimationFrame(raf); canvas.remove(); };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = dt * 60; // physics tuned per 60 fps frame
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of pieces) {
      p.age += dt;
      if (p.age >= p.life || p.y > H + 40) continue;
      alive++;
      p.vy += 0.32 * k;
      p.vx *= Math.pow(0.985, k);
      p.vy *= Math.pow(0.985, k);
      p.wobble += 0.12 * k;
      p.x += (p.vx + Math.sin(p.wobble) * 0.8) * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      const fade = p.age > p.life * 0.7 ? 1 - (p.age - p.life * 0.7) / (p.life * 0.3) : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, (-p.h / 2) * Math.abs(Math.cos(p.wobble)), p.w, p.h * Math.abs(Math.cos(p.wobble)) + 1);
      ctx.restore();
    }
    if (alive && now - started < 3500) raf = requestAnimationFrame(frame);
    else stop();
  };
  raf = requestAnimationFrame(frame);
  return stop;
}

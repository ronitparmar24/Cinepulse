/**
 * Renders the CinePulse app icons (PNG) used by the web app manifest and iOS home screen.
 * Run: npx tsx scripts/generate-pwa-icons.tsx   (writes public/icons/*.png)
 *
 * Same mark as app/icon.svg: three mint bars tilted -12° on a dark rounded tile.
 * - icon-*.png:        rounded tile with a transparent corner, for "any" purpose
 * - maskable-512.png:  full-bleed tile, mark kept inside the central safe zone (Android crops it)
 * - apple-touch-icon:  full-bleed square (iOS rounds the corners itself)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

const BG = '#101b17';
const MINT = '#b3f3d5';

function Mark({ size, scale, rounded }: { size: number; scale: number; rounded: boolean }) {
  // Bars in the original 64-unit grid: x 15/28/41, heights 24/40/31, width 8.
  const u = (size / 64) * scale;
  const bars = [
    { x: 15, y: 24, h: 24 },
    { x: 28, y: 12, h: 40 },
    { x: 41, y: 18, h: 31 },
  ];
  const offset = (size - 64 * u) / 2;
  return (
    <div style={{ width: size, height: size, display: 'flex', background: rounded ? 'transparent' : BG }}>
      <div style={{ position: 'relative', width: size, height: size, display: 'flex', borderRadius: rounded ? size * (18 / 64) : 0, background: BG, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, display: 'flex', transform: 'rotate(-12deg)' }}>
          {bars.map((b, i) => (
            <div
              key={i}
              style={{ position: 'absolute', left: offset + b.x * u, top: offset + b.y * u, width: 8 * u, height: b.h * u, borderRadius: 4 * u, background: MINT }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

async function render(file: string, size: number, scale: number, rounded: boolean) {
  const res = new ImageResponse(<Mark size={size} scale={scale} rounded={rounded} />, { width: size, height: size });
  const out = join(process.cwd(), 'public', 'icons', file);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('wrote', out);
}

async function main() {
  mkdirSync(join(process.cwd(), 'public', 'icons'), { recursive: true });
  await render('icon-192.png', 192, 1, true);
  await render('icon-512.png', 512, 1, true);
  await render('maskable-512.png', 512, 0.72, false);
  await render('apple-touch-icon.png', 180, 0.86, false);
  await render('shortcut-96.png', 96, 1, true);
}

void main();

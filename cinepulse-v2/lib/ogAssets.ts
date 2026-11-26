/**
 * Shared assets for server-rendered share images (Wrapped, review and "watched" cards):
 * TMDB posters embedded as data URLs, and Manrope fonts for the image renderer.
 */

/** A TMDB poster as a data URL (bounded size and time), or null. Only image.tmdb.org is fetched. */
export async function posterData(url: string | null, size = 'w342'): Promise<string | null> {
  if (!url) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'image.tmdb.org') return null;
  const small = url.replace(/\/t\/p\/(w\d+|original)\//, `/t/p/${size}/`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(small, { signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1_500_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type CardFont = { name: string; data: ArrayBuffer; weight: 500 | 800; style: 'normal' };
let fontCache: Promise<CardFont[]> | null = null;

/** Manrope (the site's font) as TrueType from Google Fonts, cached per server instance; [] if unreachable. */
export function loadFonts(): Promise<CardFont[]> {
  if (!fontCache) {
    fontCache = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        // Without a modern browser user agent, Google Fonts serves TrueType, which the renderer needs.
        const css = await (await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@500;800&display=swap', { signal: controller.signal })).text();
        const faces = [...css.matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\((https:[^)]+)\)/g)];
        const fonts = await Promise.all(faces.map(async ([, weight, url]) => ({
          name: 'Manrope',
          data: await (await fetch(url, { signal: controller.signal })).arrayBuffer(),
          weight: (Number(weight) >= 700 ? 800 : 500) as 500 | 800,
          style: 'normal' as const,
        })));
        return fonts.filter((f) => f.data.byteLength > 1000);
      } catch {
        fontCache = null; // try again next time
        return [];
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return fontCache;
}


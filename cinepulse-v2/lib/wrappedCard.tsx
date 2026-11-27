/**
 * The Wrapped share card: a 1080×1920 PNG (phone story size) rendered on the server.
 * Posters are fetched only from TMDB's image host, with a short timeout, and embedded as data
 * URLs so one slow or missing image can never break the card.
 */
import { ImageResponse } from 'next/og';
import type { WrappedSummary } from './wrapped';
import { loadFonts, posterData } from './ogAssets';

const STYLE_LABEL = { generous: 'Generous rater', balanced: 'Balanced critic', tough: 'Tough critic' } as const;

export async function renderWrappedCard(w: WrappedSummary, name: string): Promise<Response> {
  const fonts = await loadFonts();
  const posters = (await Promise.all(w.topFilms.slice(0, 3).map((f) => posterData(f.poster)))).map((src, i) => ({ src, title: w.topFilms[i]?.title || '' }));
  const genre = w.topGenres[0]?.name || '—';
  const style = w.ratings.style ? STYLE_LABEL[w.ratings.style] : w.ratings.average !== null ? `${w.ratings.average} / 5 average` : 'Still deciding';
  const stat = (label: string, value: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '28px 32px', borderRadius: 30, background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(179,243,213,0.16)', width: 454 }}>
      <span style={{ fontSize: 26, fontWeight: 500, color: '#8fb3a5', letterSpacing: 2, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: value.length > 12 ? 42 : 54, fontWeight: 800, color: '#f4f6f5', marginTop: 6, lineHeight: 1.1 }}>{value}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '88px 72px 76px', color: '#f4f6f5', background: 'linear-gradient(165deg, #0f2a22 0%, #0b1115 45%, #07090c 100%)', fontFamily: fonts.length ? 'Manrope' : 'sans-serif', fontWeight: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end' }}>
            <div style={{ width: 12, height: 30, borderRadius: 6, background: '#b3f3d5' }} />
            <div style={{ width: 12, height: 44, borderRadius: 6, background: '#b3f3d5' }} />
            <div style={{ width: 12, height: 36, borderRadius: 6, background: '#b3f3d5' }} />
          </div>
          <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>cinepulse</span>
          <span style={{ fontSize: 46, fontWeight: 800, color: '#b3f3d5', marginLeft: -19 }}>.</span>
        </div>

        <span style={{ marginTop: 80, fontSize: 36, fontWeight: 800, color: '#b3f3d5', letterSpacing: 6, textTransform: 'uppercase' }}>{`${name}'s ${w.year} Wrapped`}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, marginTop: 30 }}>
          <span style={{ fontSize: 240, fontWeight: 800, lineHeight: 0.95, letterSpacing: -10 }}>{String(w.filmsWatched)}</span>
          <span style={{ fontSize: 60, fontWeight: 800, color: '#cfe0d9' }}>{w.filmsWatched === 1 ? 'title watched' : 'titles watched'}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 64 }}>
          {stat('Hours of film', String(w.hoursWatched))}
          {stat('Top genre', genre)}
          {stat('Rating style', style)}
          {stat('Prediction hits', w.predictions.accuracy !== null ? `${w.predictions.accuracy}%` : `${w.predictions.calls} calls`)}
        </div>

        {posters.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 64 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#8fb3a5', letterSpacing: 4, textTransform: 'uppercase' }}>Top of the year</span>
            <div style={{ display: 'flex', gap: 28, marginTop: 24 }}>
              {posters.map((p, i) => (
                <div key={i} style={{ display: 'flex', width: 300, height: 450, borderRadius: 26, overflow: 'hidden', background: '#16211f', border: '2px solid rgba(255,255,255,0.1)', alignItems: 'flex-end' }}>
                  {p.src
                    ? <img src={p.src} width={300} height={450} style={{ objectFit: 'cover' }} alt="" />
                    : <span style={{ fontSize: 34, padding: 24, fontWeight: 800, lineHeight: 1.15 }}>{p.title.slice(0, 40)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', marginTop: 'auto', justifyContent: 'space-between', alignItems: 'center', fontSize: 28, color: '#8fb3a5' }}>
          <span>Discover it. Save it. Call it.</span>
          <span style={{ color: '#b3f3d5', fontWeight: 800 }}>#CinePulseWrapped</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, ...(fonts.length ? { fonts } : {}), headers: { 'Cache-Control': 'private, no-store' } },
  );
}

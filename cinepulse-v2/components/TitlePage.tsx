/**
 * Server-rendered title page (/film/[slug], /tv/[slug]): readable without JavaScript, shareable,
 * and indexable. The interactive view (forecasts, community, journal) opens in the app.
 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { titleById } from '@/lib/catalog';
import { idFromSlug, titlePath } from '@/lib/slug';
import type { Title } from '@/lib/types';

async function load(kind: 'film' | 'tv', slug: string): Promise<Title> {
  const id = idFromSlug(kind, slug);
  if (!id) notFound();
  try {
    return await titleById(id);
  } catch {
    notFound();
  }
}

const origin = () => process.env.APP_ORIGIN || 'https://cinepulse.app';
const year = (t: Title) => (t.releaseDate ? t.releaseDate.slice(0, 4) : null);

export async function titleMetadata(kind: 'film' | 'tv', slug: string): Promise<Metadata> {
  const id = idFromSlug(kind, slug);
  if (!id) return { title: 'Not found — CinePulse' };
  let t: Title;
  try { t = await titleById(id); } catch { return { title: 'Not found — CinePulse' }; }
  const name = `${t.title}${year(t) ? ` (${year(t)})` : ''}`;
  const description = (t.overview || t.tagline || `${name} on CinePulse.`).slice(0, 200);
  const image = t.backdrop || t.poster || undefined;
  const url = `${origin()}${titlePath(t)}`;
  return {
    title: `${name} — CinePulse`,
    description,
    alternates: { canonical: url },
    openGraph: { title: name, description, url, type: t.mediaType === 'tv' ? 'video.tv_show' : 'video.movie', images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: name, description, images: image ? [image] : undefined },
  };
}

export async function TitlePage({ kind, slug }: { kind: 'film' | 'tv'; slug: string }) {
  const t = await load(kind, slug);
  const canonical = titlePath(t);
  // Wrong media type or an outdated title part → the canonical URL.
  if (`/${kind}/${decodeURIComponent(slug)}` !== canonical) permanentRedirect(canonical);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': t.mediaType === 'tv' ? 'TVSeries' : 'Movie',
    name: t.title,
    description: t.overview || undefined,
    image: t.poster || undefined,
    datePublished: t.releaseDate || undefined,
    genre: t.genres,
    director: t.director ? { '@type': 'Person', name: t.director } : undefined,
    actor: t.cast.slice(0, 6).map((c) => ({ '@type': 'Person', name: c.name })),
    aggregateRating: t.voteAverage && t.voteCount ? { '@type': 'AggregateRating', ratingValue: t.voteAverage, ratingCount: t.voteCount, bestRating: 10 } : undefined,
  };
  const facts = [
    year(t),
    t.runtime ? `${t.runtime} min` : null,
    t.mediaType === 'tv' && t.seasons ? `${t.seasons} season${t.seasons === 1 ? '' : 's'}` : null,
    t.director ? `Directed by ${t.director}` : null,
  ].filter(Boolean);

  return (
    <main id="main" className="title-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <header className="title-page-hero" style={t.backdrop ? { backgroundImage: `linear-gradient(0deg,#0b0e12 4%,#0b0e12cc 45%,#0b0e1244), url(${t.backdrop})` } : undefined}>
        <nav className="title-page-crumbs" aria-label="Breadcrumb">
          <Link href="/">CinePulse</Link> <span aria-hidden="true">/</span> <Link href={`/?view=${t.mediaType === 'tv' ? 'explore' : 'explore'}`}>{t.mediaType === 'tv' ? 'Series' : 'Films'}</Link>
        </nav>
        <div className="title-page-head">
          {t.poster && <img className="title-page-poster" src={t.poster} alt={`${t.title} poster`} width={220} height={330} />}
          <div>
            <p className="eyebrow mint">{t.genres.slice(0, 3).join(' · ').toUpperCase() || (t.mediaType === 'tv' ? 'SERIES' : 'FILM')}</p>
            <h1>{t.title}</h1>
            {facts.length > 0 && <p className="title-page-facts">{facts.join(' · ')}</p>}
            {t.tagline && <p className="title-page-tagline">{t.tagline}</p>}
            <div className="title-page-actions">
              <Link className="button primary" href={`/?title=${encodeURIComponent(t.id)}`}>Log, rate or forecast</Link>
              {t.trailerKey && /^[A-Za-z0-9_-]{6,20}$/.test(t.trailerKey) && (
                <a className="button secondary" href={`https://www.youtube.com/watch?v=${encodeURIComponent(t.trailerKey)}`} target="_blank" rel="noreferrer">Watch trailer</a>
              )}
            </div>
          </div>
        </div>
      </header>
      <section className="section title-page-body">
        {t.overview && (
          <>
            <h2>Synopsis</h2>
            <p className="synopsis">{t.overview}</p>
          </>
        )}
        {t.cast.length > 0 && (
          <>
            <h2>Cast</h2>
            <ul className="title-page-cast">
              {t.cast.slice(0, 12).map((c) => (
                <li key={`${c.name}-${c.character}`}>
                  <b>{c.name}</b>
                  {c.character && <span>{c.character}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {t.source === 'tmdb' && <p className="fineprint">Film data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>}
      </section>
    </main>
  );
}

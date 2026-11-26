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
import { canAddToCalendar, googleCalendarUrl } from '@/lib/calendar';
import { reminderEligible } from '@/lib/releaseDates';
import { ArrowUpRight, CalendarDays, CalendarPlus, ChevronRight, Clapperboard, Clock, Film, Play, Sparkles, Star, Tv } from 'lucide-react';

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

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = Boolean(t.releaseDate && t.releaseDate > today);
  const daysTo = upcoming && t.releaseDate ? Math.ceil((Date.parse(`${t.releaseDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : 0;
  const dateText = t.releaseDate ? new Date(`${t.releaseDate}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
  const runtime = t.runtime ? `${Math.floor(t.runtime / 60) ? `${Math.floor(t.runtime / 60)}h ` : ''}${t.runtime % 60}m` : null;
  const money = (n: number | null) => (n ? `$${n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${Math.round(n / 1e6)}M`}` : null);
  const appUrl = `/?title=${encodeURIComponent(t.id)}`;
  const trailer = t.trailerKey && /^[A-Za-z0-9_-]{6,20}$/.test(t.trailerKey) ? `https://www.youtube.com/watch?v=${encodeURIComponent(t.trailerKey)}` : null;
  const calendar = canAddToCalendar(t) && reminderEligible(t.releaseDate);
  const details: Array<[string, string | null]> = [
    ['Release', dateText],
    ['Runtime', runtime],
    ['Seasons', t.mediaType === 'tv' && t.seasons ? String(t.seasons) : null],
    ['Director', t.director],
    ['Genres', t.genres.join(', ') || null],
    ['TMDB score', t.voteAverage ? `${t.voteAverage.toFixed(1)} / 10${t.voteCount ? ` · ${t.voteCount.toLocaleString('en-IN')} votes` : ''}` : null],
    ['Budget', money(t.budget)],
    ['Box office', money(t.revenue)],
  ];

  return (
    <main id="main" className="title-page tp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <header className="tp-hero">
        {t.backdrop && <div className="tp-backdrop" style={{ backgroundImage: `url(${t.backdrop})` }} aria-hidden="true" />}
        <div className="tp-shade" aria-hidden="true" />
        <nav className="tp-crumbs" aria-label="Breadcrumb">
          <Link href="/">CinePulse</Link> <ChevronRight size={13} aria-hidden="true" /> <Link href="/?view=explore">{t.mediaType === 'tv' ? 'Series' : 'Films'}</Link> <ChevronRight size={13} aria-hidden="true" /> <span aria-current="page">{t.title}</span>
        </nav>
        <div className="tp-head">
          {t.poster ? (
            <img className="tp-poster" src={t.poster} alt={`${t.title} poster`} width={260} height={390} />
          ) : (
            <div className="tp-poster tp-poster-empty" aria-hidden="true"><Film size={46} /></div>
          )}
          <div className="tp-info">
            <div className="tp-chips">
              <span className="tp-chip tp-chip-kind">{t.mediaType === 'tv' ? <Tv size={12} /> : <Film size={12} />}{t.mediaType === 'tv' ? 'Series' : 'Film'}</span>
              {t.genres.slice(0, 3).map((g) => <span key={g} className="tp-chip">{g}</span>)}
            </div>
            <h1 className="tp-title">{t.title}</h1>
            {t.tagline && <p className="tp-tagline">{t.tagline}</p>}
            <div className="tp-facts">
              {dateText && <span><CalendarDays size={14} />{dateText}</span>}
              {runtime && <span><Clock size={14} />{runtime}</span>}
              {t.mediaType === 'tv' && t.seasons ? <span><Tv size={14} />{t.seasons} season{t.seasons === 1 ? '' : 's'}</span> : null}
              {t.director && <span><Clapperboard size={14} />{t.director}</span>}
              {t.voteAverage ? <span className="tp-score"><Star size={14} fill="currentColor" />{t.voteAverage.toFixed(1)}</span> : null}
              {upcoming && <span className="tp-soon"><i aria-hidden="true" />Coming soon{daysTo > 0 ? ` · in ${daysTo} day${daysTo === 1 ? '' : 's'}` : ''}</span>}
            </div>
            <div className="tp-actions">
              <Link className="tp-btn tp-btn-primary" href={appUrl}><Sparkles size={16} />{upcoming ? 'Forecast or save it' : 'Log, rate or review'}</Link>
              {trailer && <a className="tp-btn" href={trailer} target="_blank" rel="noreferrer"><span className="tp-play"><Play size={11} fill="currentColor" /></span>Watch trailer</a>}
              {calendar && (
                <span className="tp-cal" role="group" aria-label="Add the release date to your calendar">
                  <span className="tp-cal-label"><CalendarPlus size={15} />Add to calendar</span>
                  <a href={googleCalendarUrl(t, `${origin().replace(/\/$/, '')}${titlePath(t)}`)} target="_blank" rel="noopener noreferrer">Google</a>
                  <a href={`/api/calendar/${encodeURIComponent(t.id)}`} download>Apple / Outlook</a>
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="tp-body">
        <div className="tp-main">
          {t.overview && (
            <section className="tp-section">
              <h2>Synopsis</h2>
              <p className="tp-synopsis">{t.overview}</p>
            </section>
          )}
          {t.cast.length > 0 && (
            <section className="tp-section">
              <h2>Cast</h2>
              <ul className="tp-cast">
                {t.cast.slice(0, 12).map((c, i) => (
                  <li key={`${c.name}-${c.character}`} style={{ animationDelay: `${Math.min(i, 11) * 45}ms` }}>
                    <span className="tp-cast-photo">{c.profile ? <img src={c.profile} alt="" loading="lazy" width={64} height={64} /> : <span>{c.name[0]}</span>}</span>
                    <span className="tp-cast-text"><b>{c.name}</b>{c.character && <small>{c.character}</small>}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="tp-side">
          <section className="tp-panel tp-section">
            <h2>Details</h2>
            <dl>
              {details.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
          <section className="tp-panel tp-cta tp-section">
            <b>{upcoming ? 'Will it be a hit?' : 'Seen it?'}</b>
            <p>{upcoming ? 'Make your forecast, set a release-day reminder and see where it will stream.' : 'Rate it, log it to your diary, and see what the community thinks.'}</p>
            <Link className="tp-btn tp-btn-primary" href={appUrl}>Open in CinePulse <ArrowUpRight size={15} /></Link>
          </section>
        </aside>
      </div>
      {t.source === 'tmdb' && <p className="fineprint tp-fine">Film data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>}
    </main>
  );
}

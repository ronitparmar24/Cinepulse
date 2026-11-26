import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { titleById } from '@/lib/catalog';
import { reviewSubject, type ShareSubject } from '@/lib/shareCards';
import { ratingLabel, starText } from '@/lib/rating';

// A shareable page for one public review: what link previews and visitors from social apps see.
type Props = { params: Promise<{ id: string }> };
const origin = () => (process.env.APP_ORIGIN || 'https://cinepulse.app').replace(/\/$/, '');
const validId = (id: string) => /^[A-Za-z0-9_-]{1,80}$/.test(id);

async function load(id: string): Promise<ShareSubject | null> {
  if (!validId(id)) return null;
  try {
    const s = await reviewSubject(id, null, titleById);
    return s.isPublic ? s : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = await load(id);
  if (!s) return { title: 'Review not found — CinePulse', robots: { index: false } };
  const stars = s.rating !== null ? ` ${starText(s.rating)}` : '';
  const title = `${s.author.name}’s review of ${s.title}${s.year ? ` (${s.year})` : ''}${stars}`;
  const description = s.spoiler ? 'This review contains spoilers. Read it on CinePulse.' : (s.body || '').replace(/\s+/g, ' ').slice(0, 190);
  const image = `${origin()}/api/share/review/${encodeURIComponent(s.id)}?format=og&v=${encodeURIComponent(s.date)}`;
  const url = `${origin()}/r/${encodeURIComponent(s.id)}`;
  return {
    title: `${title} — CinePulse`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'article', images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function ReviewSharePage({ params }: Props) {
  const { id } = await params;
  const s = await load(id);
  if (!s) notFound();
  return (
    <main className="review-share">
      <div className="review-share-bg" style={s.backdrop ? { backgroundImage: `url(${s.backdrop})` } : undefined} aria-hidden="true" />
      <article className="review-share-card">
        <Link href="/" className="review-share-brand">cinepulse<span>.</span></Link>
        <div className="review-share-head">
          {s.poster && <img src={s.poster} alt={`${s.title} poster`} width={160} height={240} />}
          <div>
            <p className="eyebrow mint">{s.author.name.toUpperCase()} REVIEWED</p>
            <h1>{s.title}{s.year && <span> {s.year}</span>}</h1>
            {s.rating !== null && <p className="review-share-stars" aria-label={`Rated ${ratingLabel(s.rating)} out of 5`}>{starText(s.rating)}</p>}
            <p className="review-share-meta">{s.author.username ? `@${s.author.username} · ` : ''}{new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        {s.spoiler ? (
          <details className="review-share-spoiler"><summary>This review contains spoilers — tap to read</summary><p>{s.body}</p></details>
        ) : (
          <blockquote>{s.body}</blockquote>
        )}
        <div className="review-share-actions">
          <Link className="button primary" href={`/?title=${encodeURIComponent(s.titleId)}&tab=reviews`}>Open {s.title} on CinePulse</Link>
          {s.author.username && <Link className="button secondary" href={`/u/${encodeURIComponent(s.author.username)}`}>More from {s.author.name}</Link>}
        </div>
      </article>
    </main>
  );
}

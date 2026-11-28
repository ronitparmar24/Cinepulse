import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { createHash } from 'node:crypto';
import { profileSubject, type ProfileShareSubject } from '@/lib/shareCards';

// Link previews for /u/:username (the page itself is a client component): pasting a public
// profile link unfurls into the generated profile card. Private profiles get no card or details.
type Props = { params: Promise<{ username: string }> };
const origin = () => (process.env.APP_ORIGIN || 'https://cinepulse.app').replace(/\/$/, '');
const validUsername = (u: string) => /^[A-Za-z0-9._-]{1,40}$/.test(u);

async function load(username: string): Promise<ProfileShareSubject | null> {
  if (!validUsername(username)) return null;
  try {
    const s = await profileSubject(username, null);
    return s.isPublic ? s : null;
  } catch {
    return null;
  }
}

/** Changes whenever what the card shows changes, so previews refresh after edits. */
function profileCardVersion(s: ProfileShareSubject): string {
  return createHash('sha1').update(JSON.stringify([s.name, s.username, s.avatarUrl, s.bannerUrl, s.favourites, s.films, s.reviews, s.followers, s.topGenres, s.hitRate])).digest('hex').slice(0, 10);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const s = await load(decodeURIComponent(username));
  if (!s) return { title: 'Profile — CinePulse', robots: { index: false } };
  const title = `${s.name} (@${s.username}) on CinePulse`;
  const parts = [`${s.films} film${s.films === 1 ? '' : 's'}`, `${s.reviews} review${s.reviews === 1 ? '' : 's'}`, `${s.followers} follower${s.followers === 1 ? '' : 's'}`];
  const favs = s.favourites.map((f) => f.title).filter(Boolean);
  const description = `${parts.join(' · ')}${favs.length ? ` · Favourites: ${favs.join(', ')}` : ''}`.slice(0, 200);
  const url = `${origin()}/u/${encodeURIComponent(s.username)}`;
  const image = `${origin()}/api/share/profile/${encodeURIComponent(s.username)}?format=og&v=${profileCardVersion(s)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'profile', images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}

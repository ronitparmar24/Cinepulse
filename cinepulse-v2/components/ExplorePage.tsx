'use client';
import { useState, useEffect, useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import {
  Compass, TrendingUp, List, Star, Users, UserPlus, Bookmark, BookmarkCheck, Flame, Zap,
  ChevronRight, Film, RefreshCw, X, EyeOff, Heart, LoaderCircle, Globe2, Sparkles,
} from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';
import type { TrendingFilm, TrendingReview, TrendingList, RisingUser, Title, CatalogResponse } from '@/lib/types';
import { FeedbackControls } from './FeedbackControls';
import { ReviewSocial } from './ReviewThread';
import { starText } from '@/lib/rating';
import { useCardRemoval } from './motion/removal';
import './explore.css';

type ExploreTab = 'for-you' | 'trending' | 'lists' | 'reviews' | 'people';

/** A poster that fades in once loaded and falls back to a placeholder when missing or broken. */
function Poster({ src, alt, className, icon = 28 }: { src: string | null | undefined; alt: string; className?: string; icon?: number }) {
  // Keyed by src, so a cached image that loads before effects run is never reset to hidden.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const img = ref.current;
    if (img && src && img.complete && img.naturalWidth > 0) setLoadedSrc(src);
  }, [src]);
  // Safety net: if a load event is ever missed, reveal the image once it has finished.
  useEffect(() => {
    if (!src) return;
    let tries = 0;
    const t = window.setInterval(() => {
      const img = ref.current;
      if (img?.complete && img.naturalWidth > 0) { setLoadedSrc(src); window.clearInterval(t); }
      else if (++tries > 40) window.clearInterval(t);
    }, 400);
    return () => window.clearInterval(t);
  }, [src]);
  if (!src || brokenSrc === src) {
    return <div className={`poster-placeholder ${className ?? ''}`} role="img" aria-label={alt}><Film size={icon} /><span>{alt}</span></div>;
  }
  return <img ref={ref} src={smallPoster(src)} alt={alt} className={`${className ?? ''} ex-img ${loadedSrc === src ? 'is-loaded' : ''}`} loading="lazy" decoding="async" onLoad={() => setLoadedSrc(src)} onError={() => setBrokenSrc(src)} />;
}

function PosterMosaic({ posters, size = 'sm' }: { posters: Array<string | null>; size?: 'sm' | 'md' }) {
  const valid = posters.filter((p): p is string => Boolean(p));
  if (!valid.length) {
    return <div className={`mosaic-placeholder mosaic-${size}`}><Film size={size === 'sm' ? 24 : 32} className="muted" /></div>;
  }
  if (valid.length === 1) return <Poster src={valid[0]} alt="" className={`mosaic-single mosaic-${size}`} />;
  return (
    <div className={`mosaic-grid mosaic-${size}`}>
      {valid.slice(0, 4).map((p, i) => <Poster key={i} src={p} alt="" icon={16} />)}
    </div>
  );
}

/** Cards are ~140–210px wide: TMDB's 342px posters are plenty and load much faster than 500px. */
const smallPoster = (src: string) => src.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w500\//, '$1w342/');

const stagger = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * 40}ms` });

interface CardFilm { id: string; title: string; poster: string | null; genres?: string[]; year?: string | null }

/** Shared film card: poster opens the film; quiet like / not-for-me / more buttons below. */
function FilmCard({ film, onOpen, index = 0, badge, meta, overlay }: {
  film: CardFilm; onOpen: (id: string) => void; index?: number;
  badge?: React.ReactNode; meta?: React.ReactNode; overlay?: React.ReactNode;
}) {
  // "Not for me" / seen / snooze: the card shrinks away and its neighbours slide into the gap.
  const removal = useCardRemoval();
  if (removal.phase === 'gone') return null;
  return (
    <div ref={removal.ref} className={`explore-film-card ex-in ${removal.className}`} style={stagger(index)}>
      <button type="button" className="explore-film-poster" onClick={() => onOpen(film.id)} aria-label={`Open ${film.title}`}>
        <Poster src={film.poster} alt={film.title} />
        <span className="ex-shine" aria-hidden="true" />
        {badge}
        {overlay}
      </button>
      <div className="explore-film-info">
        <button type="button" className="explore-film-title" onClick={() => onOpen(film.id)} title={film.title}>{film.title}</button>
        <p className="explore-film-rating">{meta}</p>
        <FeedbackControls
          title={{ id: film.id, title: film.title, poster: film.poster, genres: film.genres ?? [] }}
          surface="explore"
          compact
          showSocialProof={false}
          onFeedbackGiven={(sig) => { if (sig === 'not_interested' || sig === 'already_seen' || sig === 'snooze') removal.remove(); }}
          onUndo={removal.restore}
        />
      </div>
    </div>
  );
}

const communityCard = (f: TrendingFilm): CardFilm => ({ id: f.titleId, title: f.title, poster: f.poster, genres: f.genres });
const communityMeta = (f: TrendingFilm) => (f.avgRatingLast7d
  ? <><Star size={11} fill="currentColor" /> {f.avgRatingLast7d.toFixed(1)}</>
  : <span className="muted">No ratings yet</span>);

/** Top-of-the-week card with a big outlined rank number, like a top-10 shelf. */
function RankCard({ film, onOpen, index }: { film: TrendingFilm; onOpen: (id: string) => void; index: number }) {
  return (
    <div className="ex-rank ex-in" style={stagger(index)}>
      <span className="ex-rank-num" aria-hidden="true">{film.trendingRank}</span>
      <FilmCard
        film={communityCard(film)}
        onOpen={onOpen}
        index={index}
        meta={communityMeta(film)}
        overlay={<span className="explore-film-velocity" title={`${film.watchesLast7d} logs, ratings and reviews this week`}><Flame size={10} />{film.watchesLast7d} this week</span>}
      />
    </div>
  );
}

function ReviewCard({ review, onOpen, index = 0 }: { review: TrendingReview; onOpen?: (id: string) => void; index?: number }) {
  const author = review.author.displayName || review.author.username || 'Member';
  return (
    <article className="explore-review-card ex-in" style={stagger(index)}>
      <button type="button" className="explore-review-cover" onClick={() => onOpen?.(review.titleId)} aria-label={`Open ${review.titleName}`}>
        <Poster src={review.poster} alt={review.titleName} className="explore-review-poster" />
      </button>
      <div className="explore-review-body">
        <div className="explore-review-header">
          <a className="explore-author-avatar" href={review.author.username ? `/u/${encodeURIComponent(review.author.username)}` : undefined} aria-label={author}>
            {review.author.avatarUrl ? <img src={review.author.avatarUrl} alt="" /> : <span>{author[0]?.toUpperCase()}</span>}
          </a>
          <div className="explore-review-who">
            <p className="explore-author-name">{author}</p>
            <button type="button" className="explore-review-title-name" onClick={() => onOpen?.(review.titleId)}>{review.titleName}</button>
          </div>
          {review.rating !== null && <span className="explore-review-score" aria-label={`Rated ${review.rating} out of 5`}>{starText(review.rating)}</span>}
        </div>
        {review.spoiler && !review.body ? (
          <button type="button" className="explore-spoiler" onClick={() => onOpen?.(review.titleId)}><EyeOff size={14} /> Contains spoilers — open the film to read it</button>
        ) : (
          <p className="explore-review-text">{review.body.length > 220 ? `${review.body.slice(0, 220).trimEnd()}…` : review.body}</p>
        )}
        <ReviewSocial reviewId={review.reviewId} authorName={author} likesCount={review.likesCount} commentsCount={review.commentsCount} viewerLiked={review.viewerLiked}>
          <span className="explore-time muted">{new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        </ReviewSocial>
      </div>
    </article>
  );
}

function ListCard({ list, onOpen, index = 0 }: { list: TrendingList; onOpen: (list: TrendingList) => void; index?: number }) {
  const { needAuth, toast } = useApp();
  const [bookmarked, setBookmarked] = useState(Boolean(list.viewerBookmarked));
  const [bookmarks, setBookmarks] = useState(list.bookmarksCount);

  async function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation();
    if (!needAuth()) return;
    const next = !bookmarked;
    setBookmarked(next);
    setBookmarks((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      await api(`/lists/${encodeURIComponent(list.listId)}/bookmark`, next ? 'POST' : 'DELETE');
      toast(next ? 'Saved to your bookmarks.' : 'Removed from your bookmarks.');
    } catch (err) {
      setBookmarked(!next);
      setBookmarks((c) => Math.max(0, c + (next ? -1 : 1)));
      toast((err as Error).message);
    }
  }

  const owner = list.owner.displayName || list.owner.username || 'Member';
  return (
    <div className="explore-list-card ex-in" style={stagger(index)} onClick={() => onOpen(list)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(list); } }} aria-label={`Open the list ${list.name}`}>
      <div className="explore-list-cover"><PosterMosaic posters={list.coverPosters} size="md" /></div>
      <div className="explore-list-info">
        <p className="explore-list-name">{list.name}</p>
        {list.description && <p className="explore-list-desc muted">{list.description.slice(0, 80)}{list.description.length > 80 ? '…' : ''}</p>}
        <div className="explore-list-meta">
          <span className="explore-list-owner">
            {list.owner.avatarUrl ? <img src={list.owner.avatarUrl} alt="" className="explore-owner-avatar" /> : <span className="explore-owner-initial">{owner[0]?.toUpperCase()}</span>}
            {owner}
          </span>
          <span className="muted">{list.filmCount} {list.filmCount === 1 ? 'film' : 'films'}</span>
        </div>
        <div className="explore-list-actions">
          <span className="explore-action-btn"><Heart size={12} />{list.likesCount}</span>
          <button type="button" className={`explore-action-btn ${bookmarked ? 'bookmarked' : ''}`} onClick={handleBookmark} aria-pressed={bookmarked} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this list'}>
            {bookmarked ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}{bookmarks}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ListDetail {
  id: string; name: string; description: string | null;
  owner: { username: string; displayName: string };
  films: Array<{ titleId: string; title: string; poster: string | null; rank: number }>;
}

/** The list itself: every film in it, each opening its page. */
function ListModal({ list, onClose, onOpenTitle }: { list: TrendingList; onClose: () => void; onOpenTitle?: (id: string) => void }) {
  const [detail, setDetail] = useState<ListDetail | null>(null);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true;
    api<{ list: ListDetail }>(`/lists/${encodeURIComponent(list.listId)}`)
      .then((r) => { if (alive) setDetail(r.list); })
      .catch((e) => { if (alive) setError((e as Error).message || 'Couldn’t open this list'); });
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { alive = false; window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [list.listId, onClose]);

  const owner = list.owner.displayName || list.owner.username;
  return (
    <div className="ex-modal-backdrop" onClick={onClose}>
      <div className="ex-modal" role="dialog" aria-modal="true" aria-label={list.name} onClick={(e) => e.stopPropagation()}>
        <header className="ex-modal-head">
          <div>
            <span className="ex-modal-kicker"><List size={12} /> List by {list.owner.username ? <a href={`/u/${encodeURIComponent(list.owner.username)}`}>{owner}</a> : owner}</span>
            <h3>{list.name}</h3>
            {list.description && <p className="muted">{list.description}</p>}
          </div>
          <button ref={closeRef} type="button" className="ex-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {error ? (
          <p className="explore-empty muted">{error}</p>
        ) : !detail ? (
          <div className="ex-modal-grid">{Array.from({ length: Math.min(Math.max(list.filmCount, 4), 10) }).map((_, i) => <div key={i} className="ex-skel ex-skel-poster" />)}</div>
        ) : detail.films.length === 0 ? (
          <p className="explore-empty muted">This list is empty.</p>
        ) : (
          <ol className="ex-modal-grid">
            {detail.films.map((f, i) => (
              <li key={f.titleId} className="ex-in" style={stagger(i)}>
                <button type="button" onClick={() => { onClose(); onOpenTitle?.(f.titleId); }} aria-label={`Open ${f.title}`}>
                  <span className="ex-modal-poster"><Poster src={f.poster} alt={f.title} icon={22} /><i>{f.rank}</i></span>
                  <span className="ex-modal-title">{f.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function PeopleCard({ person: p, onProfile, index = 0 }: { person: RisingUser; onProfile?: (username: string) => void; index?: number }) {
  const { user, needAuth, toast } = useApp();
  const [following, setFollowing] = useState(Boolean(p.isFollowing));
  const [busy, setBusy] = useState(false);
  const displayName = p.displayName || p.name || p.username;

  async function handleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    if (!needAuth() || busy) return;
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try { await api(`/follows/${encodeURIComponent(p.username)}`, next ? 'POST' : 'DELETE'); }
    catch (err) { setFollowing(!next); toast((err as Error).message); }
    finally { setBusy(false); }
  }

  const open = () => (onProfile ? onProfile(p.username) : (window.location.href = `/u/${encodeURIComponent(p.username)}`));
  return (
    <div className="explore-people-card ex-in" style={stagger(index)} onClick={open} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(); }} aria-label={`Open ${displayName}’s profile`}>
      <div className="explore-people-avatar">
        {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <span>{displayName[0]?.toUpperCase()}</span>}
      </div>
      <div className="explore-people-info">
        <p className="explore-people-name">{displayName}</p>
        <p className="explore-people-username muted">@{p.username}</p>
        {p.bio && <p className="explore-people-bio muted">{p.bio.slice(0, 60)}{p.bio.length > 60 ? '…' : ''}</p>}
        <div className="explore-people-stats">
          <span><strong>{p.followerCount}</strong> {p.followerCount === 1 ? 'follower' : 'followers'}</span>
          {p.followerGrowth > 0 && <span className="rising-badge"><TrendingUp size={10} /> +{p.followerGrowth} this week</span>}
        </div>
      </div>
      {user?.id !== p.id && (
        <button type="button" className={`button ${following ? 'ghost' : 'primary'} small explore-follow-btn`} onClick={handleFollow} disabled={busy} aria-pressed={following}>
          {busy ? <LoaderCircle size={12} className="spin" /> : following ? 'Following' : <><UserPlus size={12} /> Follow</>}
        </button>
      )}
    </div>
  );
}

function Skeletons({ tab }: { tab: ExploreTab }) {
  if (tab === 'trending') {
    return (
      <div aria-busy="true" aria-label="Loading">
        <div className="ex-skel ex-skel-heading" />
        <div className="explore-films-masonry">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="ex-skel-film" style={stagger(i)}><div className="ex-skel ex-skel-poster" /><div className="ex-skel ex-skel-line" /><div className="ex-skel ex-skel-line short" /></div>)}</div>
      </div>
    );
  }
  if (tab === 'reviews' || tab === 'for-you') {
    return <div className="explore-reviews-masonry" aria-busy="true" aria-label="Loading">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel ex-skel-review" />)}</div>;
  }
  if (tab === 'lists') {
    return <div className="explore-lists-masonry" aria-busy="true" aria-label="Loading">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="ex-skel ex-skel-list" />)}</div>;
  }
  return <div className="explore-people-masonry" aria-busy="true" aria-label="Loading">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="ex-skel ex-skel-person" />)}</div>;
}

const TABS: { id: ExploreTab; label: string; Icon: typeof Zap }[] = [
  { id: 'for-you', label: 'For You', Icon: Zap },
  { id: 'trending', label: 'Trending', Icon: TrendingUp },
  { id: 'lists', label: 'Lists', Icon: List },
  { id: 'reviews', label: 'Reviews', Icon: Star },
  { id: 'people', label: 'People', Icon: Users },
];

interface ExplorePageProps {
  onOpenTitle?: (id: string) => void;
  onOpenProfile?: (username: string) => void;
  onOpenList?: (id: string) => void;
}

interface ForYou { trendingFilms: TrendingFilm[]; suggestedReviews: TrendingReview[]; popularLists: TrendingList[]; risingUsers: RisingUser[] }

export function ExplorePage({ onOpenTitle, onOpenProfile }: ExplorePageProps) {
  const { user } = useApp();
  const [tab, setTab] = useState<ExploreTab>('trending');
  const [films, setFilms] = useState<TrendingFilm[]>([]);
  const [reviews, setReviews] = useState<TrendingReview[]>([]);
  const [lists, setLists] = useState<TrendingList[]>([]);
  const [people, setPeople] = useState<RisingUser[]>([]);
  const [popular, setPopular] = useState<Title[]>([]);
  const [popularPage, setPopularPage] = useState(1);
  const [popularPages, setPopularPages] = useState(1);
  const [moreBusy, setMoreBusy] = useState(false);
  const [forYou, setForYou] = useState<ForYou | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<ExploreTab | null>(null);
  const [error, setError] = useState('');
  const [openList, setOpenList] = useState<TrendingList | null>(null);
  const userKey = user?.id ?? 'guest';
  const closeList = useCallback(() => setOpenList(null), []);

  // Signing in or out changes likes, bookmarks and follows: reload.
  useEffect(() => { setLoaded(new Set()); setForYou(null); }, [userKey]);

  const loadTab = useCallback(async (t: ExploreTab, force = false) => {
    const key = `${userKey}:${t}`;
    if (!force && loaded.has(key)) return;
    setLoading(t);
    setError('');
    try {
      if (t === 'trending') {
        // Community picks this week, topped up with what's popular worldwide right now.
        const [community, world] = await Promise.all([
          api<{ films: TrendingFilm[] }>('/explore/trending-films?limit=24'),
          api<CatalogResponse>('/catalog?media=all&collection=trending&page=1').catch(() => null),
        ]);
        setFilms(community.films || []);
        setPopular(world?.items ?? []);
        setPopularPage(1);
        setPopularPages(world?.totalPages ?? 1);
      }
      if (t === 'reviews') setReviews((await api<{ reviews: TrendingReview[] }>('/explore/trending-reviews?limit=20')).reviews || []);
      if (t === 'lists') setLists((await api<{ lists: TrendingList[] }>('/explore/trending-lists?limit=20')).lists || []);
      if (t === 'people') setPeople((await api<{ users: RisingUser[] }>('/explore/rising-users?limit=48')).users || []);
      if (t === 'for-you') {
        if (user) {
          setForYou(await api<ForYou>('/explore/for-you'));
        } else {
          const [f, r, l, p] = await Promise.all([
            api<{ films: TrendingFilm[] }>('/explore/trending-films?limit=12'),
            api<{ reviews: TrendingReview[] }>('/explore/trending-reviews?limit=6'),
            api<{ lists: TrendingList[] }>('/explore/trending-lists?limit=6'),
            api<{ users: RisingUser[] }>('/explore/rising-users?limit=4'),
          ]);
          setForYou({ trendingFilms: f.films || [], suggestedReviews: r.reviews || [], popularLists: l.lists || [], risingUsers: p.users || [] });
        }
      }
      setLoaded((s) => new Set(s).add(key));
    } catch (e) {
      setError((e as Error)?.message || 'Couldn’t load this right now');
    } finally {
      setLoading((cur) => (cur === t ? null : cur));
    }
  }, [loaded, user, userKey]);

  useEffect(() => { void loadTab(tab); }, [tab, userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: string) => onOpenTitle?.(id);
  const loadMorePopular = async () => {
    if (moreBusy) return;
    setMoreBusy(true);
    try {
      const next = popularPage + 1;
      const r = await api<CatalogResponse>(`/catalog?media=all&collection=trending&page=${next}`);
      setPopular((list) => [...list, ...r.items.filter((t) => !list.some((x) => x.id === t.id))]);
      setPopularPage(next);
      setPopularPages(r.totalPages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMoreBusy(false);
    }
  };
  const ready = loaded.has(`${userKey}:${tab}`);

  function renderContent() {
    if (error && !ready) {
      return (
        <div className="explore-error">
          <p className="muted">{error}</p>
          <button type="button" className="button ghost small" onClick={() => void loadTab(tab, true)}><RefreshCw size={14} /> Try again</button>
        </div>
      );
    }
    if (!ready) return <Skeletons tab={tab} />;

    switch (tab) {
      case 'for-you': {
        const d = forYou ?? { trendingFilms: [], suggestedReviews: [], popularLists: [], risingUsers: [] };
        const empty = !d.trendingFilms.length && !d.suggestedReviews.length && !d.popularLists.length;
        return (
          <div className="explore-for-you">
            {d.trendingFilms.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><Flame size={16} /> Trending now</h3>
                  <button type="button" className="explore-see-all" onClick={() => setTab('trending')}>See all <ChevronRight size={14} /></button>
                </div>
                <div className="explore-films-scroll">{d.trendingFilms.slice(0, 10).map((f, i) => <FilmCard key={f.titleId} film={communityCard(f)} onOpen={open} index={i} meta={communityMeta(f)} badge={<span className="explore-film-rank">#{f.trendingRank}</span>} />)}</div>
              </section>
            )}
            {d.suggestedReviews.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><Star size={16} /> Reviews for you</h3>
                  <button type="button" className="explore-see-all" onClick={() => setTab('reviews')}>See all <ChevronRight size={14} /></button>
                </div>
                <div className="explore-reviews-grid">{d.suggestedReviews.slice(0, 4).map((r, i) => <ReviewCard key={r.reviewId} review={r} onOpen={open} index={i} />)}</div>
              </section>
            )}
            {d.popularLists.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><List size={16} /> Popular lists</h3>
                  <button type="button" className="explore-see-all" onClick={() => setTab('lists')}>See all <ChevronRight size={14} /></button>
                </div>
                <div className="explore-lists-scroll">{d.popularLists.slice(0, 6).map((l, i) => <ListCard key={l.listId} list={l} onOpen={setOpenList} index={i} />)}</div>
              </section>
            )}
            {d.risingUsers.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><TrendingUp size={16} /> Rising critics</h3>
                  <button type="button" className="explore-see-all" onClick={() => setTab('people')}>See all <ChevronRight size={14} /></button>
                </div>
                <div className="explore-people-grid">{d.risingUsers.slice(0, 4).map((p, i) => <PeopleCard key={p.id} person={p} onProfile={onOpenProfile} index={i} />)}</div>
              </section>
            )}
            {empty && (
              <div className="explore-empty">
                <Compass size={48} className="muted" />
                <p className="muted">Log, rate and review a few films to unlock your personal feed.</p>
              </div>
            )}
          </div>
        );
      }
      case 'trending': {
        const inCommunity = new Set(films.map((f) => f.titleId));
        const worldwide = popular.filter((t) => !inCommunity.has(t.id) && t.poster);
        return (
          <div className="explore-section">
            {films.length > 0 && (
              <section className="ex-block">
                <div className="ex-block-head">
                  <div>
                    <span className="ex-kicker"><Flame size={12} /> This week on CinePulse</span>
                    <h3>Most logged by the community</h3>
                  </div>
                  <p className="muted">Watched, rated and reviewed in the last 7 days</p>
                </div>
                <div className="ex-rank-row">{films.map((f, i) => <RankCard key={f.titleId} film={f} onOpen={open} index={i} />)}</div>
              </section>
            )}
            {worldwide.length > 0 && (
              <section className="ex-block">
                <div className="ex-block-head">
                  <div>
                    <span className="ex-kicker"><Globe2 size={12} /> Popular right now</span>
                    <h3>Trending worldwide</h3>
                  </div>
                  <p className="muted">What everyone is talking about this week</p>
                </div>
                <div className="explore-films-masonry">
                  {worldwide.map((t, i) => (
                    <FilmCard
                      key={t.id}
                      film={{ id: t.id, title: t.title, poster: t.poster, genres: t.genres }}
                      onOpen={open}
                      index={i % 12}
                      meta={<span className="ex-meta"><span>{[t.releaseDate?.slice(0, 4), t.genres[0]].filter(Boolean).join(' · ')}</span>{t.voteAverage ? <em title="TMDB score out of 10">{t.voteAverage.toFixed(1)}</em> : null}</span>}
                    />
                  ))}
                </div>
                {popularPage < Math.min(popularPages, 5) && (
                  <div className="ex-more">
                    <button type="button" className="button secondary" onClick={() => void loadMorePopular()} disabled={moreBusy}>
                      {moreBusy ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />} Show more
                    </button>
                  </div>
                )}
              </section>
            )}
            {films.length === 0 && worldwide.length === 0 && (
              <div className="explore-empty"><Film size={48} className="muted" /><p className="muted">Nothing trending yet. Log a film to get it started.</p></div>
            )}
          </div>
        );
      }
      case 'lists':
        return (
          <div>
            <p className="explore-hint muted"><Bookmark size={12} /> The community’s most-saved lists</p>
            {lists.length === 0 ? (
              <div className="explore-empty"><List size={48} className="muted" /><p className="muted">No public lists yet.</p></div>
            ) : (
              <div className="explore-lists-masonry">{lists.map((l, i) => <ListCard key={l.listId} list={l} onOpen={setOpenList} index={i} />)}</div>
            )}
          </div>
        );
      case 'reviews':
        return (
          <div>
            <p className="explore-hint muted"><Star size={12} /> Reviews getting the most love and conversation this week</p>
            {reviews.length === 0 ? (
              <div className="explore-empty"><Star size={48} className="muted" /><p className="muted">No reviews this week yet.</p></div>
            ) : (
              <div className="explore-reviews-masonry">{reviews.map((r, i) => <ReviewCard key={r.reviewId} review={r} onOpen={open} index={i} />)}</div>
            )}
          </div>
        );
      case 'people':
        return (
          <div>
            <p className="explore-hint muted"><Users size={12} /> Cinephiles and critics on CinePulse</p>
            {people.length === 0 ? (
              <div className="explore-empty"><Users size={48} className="muted" /><p className="muted">No one to show yet.</p></div>
            ) : (
              <div className="explore-people-masonry">{people.map((p, i) => <PeopleCard key={p.id} person={p} onProfile={onOpenProfile} index={i} />)}</div>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="explore-page">
      <header className="exh">
        <div className="exh-aurora" aria-hidden="true" />
        <span className="exh-kicker"><Compass size={13} /> Explore</span>
        <h2 className="exh-title">See what the community is <RotatingWord words={['watching', 'rating', 'reviewing', 'curating']} /></h2>
        <p className="exh-sub">Trending films, the reviews people are talking about, lists worth saving and critics worth following.</p>
      </header>

      <ExploreTabs tab={tab} onChange={setTab} busy={loading !== null && ready ? loading : null} />

      <div className="explore-content ex-panel" role="tabpanel" id="explore-panel" aria-labelledby={`explore-tab-${tab}`} key={tab}>
        {renderContent()}
      </div>

      {openList && <ListModal list={openList} onClose={closeList} onOpenTitle={onOpenTitle} />}
    </div>
  );
}

/** Segmented tabs with an indicator that slides to the active tab. */
function ExploreTabs({ tab, onChange, busy }: { tab: ExploreTab; onChange: (t: ExploreTab) => void; busy: ExploreTab | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
      if (el) {
        setBar({ x: el.offsetLeft, w: el.offsetWidth });
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab]);
  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.key === 'ArrowRight') onChange(TABS[(i + 1) % TABS.length].id);
    if (e.key === 'ArrowLeft') onChange(TABS[(i - 1 + TABS.length) % TABS.length].id);
  };
  return (
    <div className="ext-wrap">
      <div className="ext" ref={wrap} role="tablist" aria-label="Explore" onKeyDown={onKey}>
        {bar && <span className="ext-bar" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} aria-hidden="true" />}
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} type="button" data-tab={id} className={`ext-tab ${tab === id ? 'is-on' : ''}`} onClick={() => onChange(id)} role="tab" aria-selected={tab === id} aria-controls="explore-panel" id={`explore-tab-${id}`} tabIndex={tab === id ? 0 : -1}>
            <Icon size={14} />
            <span>{label}</span>
            {busy === id && <LoaderCircle size={12} className="spin" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A word that gently swaps every few seconds (stays put for reduced-motion users). */
function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % words.length), 2600);
    return () => window.clearInterval(t);
  }, [words.length]);
  return (
    <span className="exh-word" aria-live="off">
      <span key={i} className="exh-word-in">{words[i]}</span>
    </span>
  );
}

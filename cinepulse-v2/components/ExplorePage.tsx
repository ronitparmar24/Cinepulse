'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Compass, TrendingUp, List, Star, Users, UserPlus, Play, Heart, MessageCircle,
  Bookmark, BookmarkCheck, Flame, Zap, ChevronRight, Clock, Film, RefreshCw
} from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';
import type { TrendingFilm, TrendingReview, TrendingList, RisingUser } from '@/lib/types';

type ExploreTab = 'for-you' | 'trending' | 'lists' | 'reviews' | 'people';

function StarRating({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (!rating) return null;
  const pct = (rating / (max * 2)) * 100;
  return (
    <span className="explore-stars" title={`${rating}/10`}>
      {'★'.repeat(Math.round(rating / 2))}{'☆'.repeat(max - Math.round(rating / 2))}
    </span>
  );
}

function PosterMosaic({ posters, size = 'sm' }: { posters: Array<string | null>; size?: 'sm' | 'md' }) {
  const valid = posters.filter(Boolean);
  if (!valid.length) {
    return (
      <div className={`mosaic-placeholder mosaic-${size}`}>
        <Film size={size === 'sm' ? 24 : 32} className="muted" />
      </div>
    );
  }
  if (valid.length === 1) {
    return <img src={valid[0]!} alt="" className={`mosaic-single mosaic-${size}`} loading="lazy" />;
  }
  return (
    <div className={`mosaic-grid mosaic-${size}`}>
      {valid.slice(0, 4).map((p, i) => (
        <img key={i} src={p!} alt="" loading="lazy" />
      ))}
    </div>
  );
}

function FilmCard({ film, onOpen }: { film: TrendingFilm; onOpen: (id: string) => void }) {
  return (
    <div className="explore-film-card" onClick={() => onOpen(film.titleId)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(film.titleId)}>
      <div className="explore-film-poster">
        {film.poster
          ? <img src={film.poster} alt={film.title} loading="lazy" />
          : <div className="poster-placeholder"><Film size={32} /></div>
        }
        <div className="explore-film-rank">#{film.trendingRank}</div>
        <div className="explore-film-velocity">
          <Flame size={10} />
          {film.watchesLast7d}
        </div>
      </div>
      <div className="explore-film-info">
        <p className="explore-film-title">{film.title}</p>
        {film.avgRatingLast7d && (
          <p className="explore-film-rating">⭐ {film.avgRatingLast7d.toFixed(1)}</p>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review, onOpen }: { review: TrendingReview; onOpen?: (id: string) => void }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(review.likesCount);
  const lastTap = useRef(0);

  async function handleLike() {
    setLiked((v) => !v);
    setLikeCount((c) => liked ? c - 1 : c + 1);
    try {
      if (!liked) await api('/likes', 'POST', { targetType: 'review', targetId: review.reviewId });
      else await api(`/likes?targetType=review&targetId=${review.reviewId}`, 'DELETE');
    } catch {
      setLiked((v) => !v);
      setLikeCount((c) => liked ? c + 1 : c - 1);
    }
  }

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      if (!liked) handleLike();
    }
    lastTap.current = now;
  }

  return (
    <div className="explore-review-card" onClick={handleDoubleTap}>
      {review.poster && <img src={review.poster} alt={review.titleName} className="explore-review-poster" loading="lazy" />}
      <div className="explore-review-body">
        <div className="explore-review-header">
          <div className="explore-author-avatar">
            {review.author.avatarUrl
              ? <img src={review.author.avatarUrl} alt={review.author.displayName} />
              : <span>{review.author.displayName[0]}</span>
            }
          </div>
          <div>
            <p className="explore-author-name">{review.author.displayName}</p>
            <p className="explore-review-title-name">{review.titleName}</p>
          </div>
          {review.rating !== null && (
            <span className="explore-review-score">{review.rating}<span className="muted">/10</span></span>
          )}
        </div>
        <p className="explore-review-text">
          {review.spoiler ? (
            <span className="spoiler-tag">⚠️ Spoiler</span>
          ) : (
            review.body.slice(0, 200) + (review.body.length > 200 ? '…' : '')
          )}
        </p>
        <div className="explore-review-actions">
          <button className={`explore-action-btn ${liked ? 'liked' : ''}`} onClick={(e) => { e.stopPropagation(); handleLike(); }}>
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
            <span>{likeCount}</span>
          </button>
          <span className="explore-action-btn">
            <MessageCircle size={14} />
            <span>{review.commentsCount}</span>
          </span>
          <span className="explore-time muted">{new Date(review.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function ListCard({ list, onOpen }: { list: TrendingList; onOpen?: (id: string) => void }) {
  const { user } = useApp();
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarks, setBookmarks] = useState(list.bookmarksCount);

  async function handleBookmark(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    const next = !bookmarked;
    setBookmarked(next);
    setBookmarks((c) => next ? c + 1 : c - 1);
    try {
      if (next) await api(`/lists/${list.listId}/bookmark`, 'POST');
      else await api(`/lists/${list.listId}/bookmark`, 'DELETE');
    } catch {
      setBookmarked(!next);
      setBookmarks((c) => next ? c - 1 : c + 1);
    }
  }

  return (
    <div className="explore-list-card" onClick={() => onOpen?.(list.listId)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.(list.listId)}>
      <div className="explore-list-cover">
        <PosterMosaic posters={list.coverPosters} size="md" />
      </div>
      <div className="explore-list-info">
        <p className="explore-list-name">{list.name}</p>
        {list.description && (
          <p className="explore-list-desc muted">{list.description.slice(0, 80)}{list.description.length > 80 ? '…' : ''}</p>
        )}
        <div className="explore-list-meta">
          <span className="explore-list-owner">
            {list.owner.avatarUrl
              ? <img src={list.owner.avatarUrl} alt={list.owner.displayName} className="explore-owner-avatar" />
              : <span className="explore-owner-initial">{list.owner.displayName[0]}</span>
            }
            {list.owner.displayName}
          </span>
          <span className="muted">{list.filmCount} films</span>
        </div>
        <div className="explore-list-actions">
          <span className="explore-action-btn">
            <Heart size={12} />
            {list.likesCount}
          </span>
          <button className={`explore-action-btn ${bookmarked ? 'bookmarked' : ''}`} onClick={handleBookmark} title={bookmarked ? 'Remove bookmark' : 'Bookmark list'}>
            {bookmarked ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
            {bookmarks}
          </button>
        </div>
      </div>
    </div>
  );
}

function PeopleCard({ person: p, onProfile }: { person: RisingUser; onProfile?: (username: string) => void }) {
  const { user } = useApp();
  const [following, setFollowing] = useState(p.isFollowing || false);

  async function handleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    const next = !following;
    setFollowing(next);
    try {
      if (next) await api(`/follows/${p.username}`, 'POST');
      else await api(`/follows/${p.username}`, 'DELETE');
    } catch { setFollowing(!next); }
  }

  return (
    <div className="explore-people-card">
      <div className="explore-people-avatar" onClick={() => onProfile?.(p.username)}>
        {p.avatarUrl
          ? <img src={p.avatarUrl} alt={p.displayName} />
          : <span>{p.displayName[0]}</span>
        }
      </div>
      <div className="explore-people-info">
        <p className="explore-people-name">{p.displayName}</p>
        <p className="explore-people-username muted">@{p.username}</p>
        {p.bio && <p className="explore-people-bio muted">{p.bio.slice(0, 60)}{p.bio.length > 60 ? '…' : ''}</p>}
        <div className="explore-people-stats">
          <span><strong>{p.followerCount}</strong> followers</span>
          {p.followerGrowth > 0 && (
            <span className="rising-badge"><TrendingUp size={10} /> +{p.followerGrowth} this week</span>
          )}
        </div>
      </div>
      {user && user.id !== p.id && (
        <button className={`button ${following ? 'ghost' : 'primary'} small explore-follow-btn`} onClick={handleFollow}>
          {following ? 'Following' : <><UserPlus size={12} /> Follow</>}
        </button>
      )}
    </div>
  );
}

function SkeletonCard({ variant }: { variant: 'film' | 'review' | 'list' | 'people' }) {
  return <div className={`skeleton-card skeleton-${variant}`} aria-hidden="true" />;
}

const TABS: { id: ExploreTab; label: string; Icon: any }[] = [
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

export function ExplorePage({ onOpenTitle, onOpenProfile, onOpenList }: ExplorePageProps) {
  const { user } = useApp();
  const [tab, setTab] = useState<ExploreTab>('trending');

  const [trendingFilms, setTrendingFilms] = useState<TrendingFilm[]>([]);
  const [trendingReviews, setTrendingReviews] = useState<TrendingReview[]>([]);
  const [trendingLists, setTrendingLists] = useState<TrendingList[]>([]);
  const [risingUsers, setRisingUsers] = useState<RisingUser[]>([]);
  const [forYouData, setForYouData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadTab = useCallback(async (t: ExploreTab) => {
    setLoading(true);
    setError('');
    try {
      if (t === 'trending' && !trendingFilms.length) {
        const res = await api<{ films: TrendingFilm[] }>('/explore/trending-films?limit=20');
        setTrendingFilms(res.films || []);
      }
      if (t === 'reviews' && !trendingReviews.length) {
        const res = await api<{ reviews: TrendingReview[] }>('/explore/trending-reviews?limit=20');
        setTrendingReviews(res.reviews || []);
      }
      if (t === 'lists' && !trendingLists.length) {
        const res = await api<{ lists: TrendingList[] }>('/explore/trending-lists?limit=20');
        setTrendingLists(res.lists || []);
      }
      if (t === 'people' && !risingUsers.length) {
        const res = await api<{ users: RisingUser[] }>('/explore/rising-users?limit=20');
        setRisingUsers(res.users || []);
      }
      if (t === 'for-you' && !forYouData && user) {
        const res = await api<any>('/explore/for-you');
        setForYouData(res);
        if (!trendingFilms.length) setTrendingFilms(res.trendingFilms || []);
        if (!trendingReviews.length) setTrendingReviews(res.suggestedReviews || []);
        if (!trendingLists.length) setTrendingLists(res.popularLists || []);
        if (!risingUsers.length) setRisingUsers(res.risingUsers || []);
      }
      if (t === 'for-you' && !user) {
        // For unauthenticated users, show trending content
        const [filmsRes, reviewsRes, listsRes] = await Promise.all([
          !trendingFilms.length ? api<{ films: TrendingFilm[] }>('/explore/trending-films?limit=12') : Promise.resolve({ films: trendingFilms }),
          !trendingReviews.length ? api<{ reviews: TrendingReview[] }>('/explore/trending-reviews?limit=8') : Promise.resolve({ reviews: trendingReviews }),
          !trendingLists.length ? api<{ lists: TrendingList[] }>('/explore/trending-lists?limit=8') : Promise.resolve({ lists: trendingLists }),
        ]);
        setTrendingFilms(filmsRes.films || []);
        setTrendingReviews(reviewsRes.reviews || []);
        setTrendingLists(listsRes.lists || []);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load explore content');
    } finally {
      setLoading(false);
    }
  }, [trendingFilms.length, trendingReviews.length, trendingLists.length, risingUsers.length, forYouData, user]);

  useEffect(() => { loadTab(tab); }, [tab]);

  function renderContent() {
    if (loading && !trendingFilms.length && !trendingReviews.length) {
      return (
        <div className="explore-skeleton-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} variant={tab === 'reviews' ? 'review' : tab === 'lists' ? 'list' : tab === 'people' ? 'people' : 'film'} />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="explore-error">
          <p className="muted">{error}</p>
          <button className="button ghost small" onClick={() => loadTab(tab)}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      );
    }

    switch (tab) {
      case 'for-you':
        return (
          <div className="explore-for-you">
            {trendingFilms.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><Flame size={16} /> Trending Now</h3>
                  <button className="explore-see-all" onClick={() => setTab('trending')}>
                    See all <ChevronRight size={14} />
                  </button>
                </div>
                <div className="explore-films-scroll">
                  {trendingFilms.slice(0, 10).map((f) => (
                    <FilmCard key={f.titleId} film={f} onOpen={(id) => onOpenTitle?.(id)} />
                  ))}
                </div>
              </section>
            )}
            {trendingReviews.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><Star size={16} /> Trending Reviews</h3>
                  <button className="explore-see-all" onClick={() => setTab('reviews')}>
                    See all <ChevronRight size={14} />
                  </button>
                </div>
                <div className="explore-reviews-grid">
                  {trendingReviews.slice(0, 4).map((r) => (
                    <ReviewCard key={r.reviewId} review={r} />
                  ))}
                </div>
              </section>
            )}
            {trendingLists.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><List size={16} /> Popular Lists</h3>
                  <button className="explore-see-all" onClick={() => setTab('lists')}>
                    See all <ChevronRight size={14} />
                  </button>
                </div>
                <div className="explore-lists-scroll">
                  {trendingLists.slice(0, 6).map((l) => (
                    <ListCard key={l.listId} list={l} onOpen={(id) => onOpenList?.(id)} />
                  ))}
                </div>
              </section>
            )}
            {risingUsers.length > 0 && (
              <section className="explore-section">
                <div className="explore-section-header">
                  <h3><TrendingUp size={16} /> Rising Critics</h3>
                  <button className="explore-see-all" onClick={() => setTab('people')}>
                    See all <ChevronRight size={14} />
                  </button>
                </div>
                <div className="explore-people-grid">
                  {risingUsers.slice(0, 4).map((p) => (
                    <PeopleCard key={p.id} person={p} onProfile={onOpenProfile} />
                  ))}
                </div>
              </section>
            )}
            {!trendingFilms.length && !trendingReviews.length && !trendingLists.length && (
              <div className="explore-empty">
                <Compass size={48} className="muted" />
                <p className="muted">Start logging films to unlock your personalized feed.</p>
              </div>
            )}
          </div>
        );

      case 'trending':
        return (
          <div className="explore-section">
            <p className="explore-hint muted"><Flame size={12} /> Trending films from the last 7 days based on community activity</p>
            {trendingFilms.length === 0 ? (
              <div className="explore-empty"><Film size={48} className="muted" /><p className="muted">No trending films yet. Start watching!</p></div>
            ) : (
              <div className="explore-films-masonry">
                {trendingFilms.map((f) => <FilmCard key={f.titleId} film={f} onOpen={(id) => onOpenTitle?.(id)} />)}
              </div>
            )}
          </div>
        );

      case 'lists':
        return (
          <div>
            <p className="explore-hint muted"><Bookmark size={12} /> Most-bookmarked community curations</p>
            {trendingLists.length === 0 ? (
              <div className="explore-empty"><List size={48} className="muted" /><p className="muted">No public lists yet.</p></div>
            ) : (
              <div className="explore-lists-masonry">
                {trendingLists.map((l) => <ListCard key={l.listId} list={l} onOpen={(id) => onOpenList?.(id)} />)}
              </div>
            )}
          </div>
        );

      case 'reviews':
        return (
          <div>
            <p className="explore-hint muted"><Star size={12} /> Reviews gaining the most attention this week</p>
            {trendingReviews.length === 0 ? (
              <div className="explore-empty"><Star size={48} className="muted" /><p className="muted">No trending reviews yet.</p></div>
            ) : (
              <div className="explore-reviews-masonry">
                {trendingReviews.map((r) => <ReviewCard key={r.reviewId} review={r} />)}
              </div>
            )}
          </div>
        );

      case 'people':
        return (
          <div>
            <p className="explore-hint muted"><TrendingUp size={12} /> Cinephiles gaining followers this week</p>
            {risingUsers.length === 0 ? (
              <div className="explore-empty"><Users size={48} className="muted" /><p className="muted">No rising users yet.</p></div>
            ) : (
              <div className="explore-people-masonry">
                {risingUsers.map((p) => <PeopleCard key={p.id} person={p} onProfile={onOpenProfile} />)}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="explore-page">
      <div className="explore-header">
        <h2 className="explore-title"><Compass size={20} /> Explore</h2>
        <p className="explore-subtitle muted">Discover what the CinePulse community is watching, reviewing, and curating</p>
      </div>

      <nav className="explore-tabs" role="tablist">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`explore-tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
            role="tab"
            aria-selected={tab === id}
            id={`explore-tab-${id}`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="explore-content" role="tabpanel" aria-labelledby={`explore-tab-${tab}`}>
        {renderContent()}
      </div>
    </div>
  );
}

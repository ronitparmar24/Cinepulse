'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Activity, ArrowUpRight, Check, Eye, EyeOff,
  Film, Globe2, Heart, MessageCircle, Sparkles, UserPlus, Users
} from 'lucide-react';
import type { ActivityEvent } from '@/lib/types';
import { ratingLabel, starText } from '@/lib/rating';
import { api } from './client';
import { Empty, Modal } from './UI';
import { useApp } from './Context';
import { ReportButton } from './ReportButton';
import { getCachedFeed, setCachedFeed } from './catalogCache';
import { AiBadge } from './AiBadge';
import { timeAgo } from './ReviewThread';
import { RingAvatar, SlidingTabs, stagger } from './SocialMotion';
import './feed.css';

export function ActivityFeed() {
  const { user, showAuth, openTitle } = useApp();
  const [feedMode, setFeedMode] = useState<'followed' | 'global'>('followed');
  const [showAi, setShowAi] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('cinepulse_show_ai') !== 'false';
  });
  const [items, setItems] = useState<ActivityEvent[]>(() => {
    const cached = getCachedFeed('followed') || getCachedFeed('global');
    return cached ? cached.data : [];
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(!items.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  // The event whose heart just got tapped, so only that one plays the pop.
  const [popId, setPopId] = useState<number | null>(null);

  function toggleShowAi() {
    setShowAi((prev) => {
      const next = !prev;
      localStorage.setItem('cinepulse_show_ai', String(next));
      return next;
    });
  }

  // Comments state
  const [activeCommentEvent, setActiveCommentEvent] = useState<ActivityEvent | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  // Notice / Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const fetchFeed = useCallback(async (mode: 'followed' | 'global', cursor?: string | null) => {
    if (!cursor) {
      const cached = getCachedFeed(mode);
      if (cached) {
        setItems(cached.data);
        setLoading(false);
        if (!cached.isExpired) return;
      } else {
        setLoading(true);
      }
    } else {
      setLoadingMore(true);
    }

    const endpoint = mode === 'followed' ? '/feed' : '/feed/global';
    const url = cursor ? `${endpoint}?cursor=${encodeURIComponent(cursor)}` : endpoint;

    try {
      const res = await api<{ items: ActivityEvent[]; nextCursor: string | null; hasMore: boolean }>(url);
      if (cursor) {
        setItems((prev) => [...prev, ...(res.items || [])]);
      } else {
        setItems(res.items || []);
        setCachedFeed(mode, res.items || []);
      }
      setNextCursor(res.nextCursor || null);
      setHasMore(Boolean(res.hasMore));
    } catch {
      if (!cursor && !items.length) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [items.length]);

  useEffect(() => {
    void fetchFeed(user ? feedMode : 'global');
    api<{ suggestions: any[] }>('/suggestions/who-to-follow')
      .then((res) => setSuggestions(res.suggestions || []))
      .catch(() => {});
  }, [feedMode, user, fetchFeed]);

  // Like an activity event
  async function handleLike(eventId: number) {
    if (!user) {
      showAuth();
      return;
    }
    const evt = items.find((i) => i.id === eventId);
    if (!evt) return;
    const nextLiked = !evt.isLiked;
    if (nextLiked) { setPopId(eventId); window.setTimeout(() => setPopId((id) => (id === eventId ? null : id)), 600); }

    setItems((prev) => prev.map((i) => i.id === eventId ? {
      ...i,
      isLiked: nextLiked,
      likesCount: (i.likesCount || 0) + (nextLiked ? 1 : -1),
    } : i));

    try {
      await api('/likes', nextLiked ? 'POST' : 'DELETE', { targetType: 'activity_event', targetId: String(eventId) });
    } catch {
      setItems((prev) => prev.map((i) => i.id === eventId ? evt : i));
    }
  }

  // Reveal spoiler on event
  async function handleRevealSpoiler(eventId: number) {
    if (!user) {
      showAuth();
      return;
    }
    try {
      await api(`/reviews/${eventId}/reveal`, 'POST');
      setItems((prev) => prev.map((i) => i.id === eventId ? {
        ...i,
        metadata: { ...i.metadata, spoilerRevealed: true, spoilerRedacted: false },
      } : i));
    } catch {}
  }

  // Open comments
  async function openComments(event: ActivityEvent) {
    setActiveCommentEvent(event);
    setComments([]);
    try {
      const res = await api<{ comments: any[] }>(`/comments?targetType=activity_event&targetId=${event.id}`);
      setComments(res.comments || []);
    } catch {}
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentInput.trim() || !activeCommentEvent || !user) return;
    setCommentBusy(true);
    try {
      const res = await api<{ comment: any }>('/comments', 'POST', {
        targetType: 'activity_event',
        targetId: String(activeCommentEvent.id),
        body: commentInput.trim(),
      });
      if (res.comment) {
        setComments((prev) => [...prev, res.comment]);
        setCommentInput('');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to post comment');
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleFollowUser(username: string) {
    if (!user) {
      showAuth();
      return;
    }
    try {
      await api(`/follows/${encodeURIComponent(username)}`, 'POST');
      setSuggestions((prev) => prev.filter((s) => s.username !== username));
      showToast(`Followed @${username}!`);
      // Refresh feed
      void fetchFeed(feedMode);
    } catch (err: any) {
      showToast(err.message || 'Follow failed');
    }
  }

  /** The verb for each event; the film itself is shown beside its poster. */
  function renderEventAction(event: ActivityEvent) {
    const meta = event.metadata || {};
    switch (event.type) {
      case 'watched': return <>{meta.rewatch ? 'rewatched' : 'watched'}</>;
      case 'rated': return <>rated</>;
      case 'reviewed': return <>reviewed</>;
      case 'added_to_watchlist': return <>added to their watchlist</>;
      case 'made_call':
        return (
          <>
            called{' '}
            <span className={`fd-call ${meta.choice === 'hit' ? 'is-hit' : 'is-flop'}`}>{meta.choice ? String(meta.choice).toUpperCase() : 'CALL'}</span>
            {meta.confidence ? <span className="fd-dim"> · {meta.confidence}% confidence</span> : null}
          </>
        );
      case 'created_list':
        return <>created a new list: <strong className="fd-mint">{meta.listName || 'Curated List'}</strong></>;
      case 'followed':
        return <>started following <a href={`/u/${meta.username}`} className="fd-mint fd-strong">@{meta.username}</a></>;
      default:
        return <>shared an activity</>;
    }
  }

  const visible = items.filter((evt) => showAi || !evt.user?.isAi);

  return (
    <section className="section space-page fd-page">
      {toastMsg && <div className="toast" role="status"><Check size={16} /> {toastMsg}</div>}

      <header className="sxh fd-hero">
        <div className="sxh-aurora" aria-hidden="true" />
        <div className="sxh-row">
          <div>
            <span className="sxh-kicker"><Activity size={13} /> Activity</span>
            <h1 className="sxh-title">What your circle is <em>watching</em> &amp; predicting.</h1>
            <p className="sxh-sub">Real activity from real members, strictly in the order it happened. No engagement-bait algorithms, no dwell-time ranking.</p>
          </div>
          <div className="fd-promise" title="Every post appears strictly in the order it occurred.">
            <Sparkles size={15} aria-hidden="true" />
            <span><b>Reverse-chronological</b> promise</span>
          </div>
        </div>
      </header>

      {/* Feed Mode Selector */}
      <div className="fd-toolbar">
        <SlidingTabs
          tabs={[
            { id: 'followed', label: user ? 'Following' : 'Following · sign in', Icon: Users },
            { id: 'global', label: 'Global Firehose', Icon: Globe2 },
          ]}
          value={feedMode}
          onChange={(id) => setFeedMode(id)}
          label="Feed source"
          idPrefix="feed-tab"
          panelId="feed-panel"
        />

        <button
          type="button"
          className={`activity-filter-chip fd-ai-chip ${showAi ? 'active' : ''}`}
          onClick={toggleShowAi}
          title="Toggle AI critic personas in your feed"
          aria-pressed={showAi}
        >
          <AiBadge />
          <span>{showAi ? 'AI Crew Visible' : 'AI Crew Hidden'}</span>
        </button>
      </div>

      <div className="feed-layout fd-layout">
        {/* Main Feed Column */}
        <div id="feed-panel" role="tabpanel" aria-labelledby={`feed-tab-${feedMode}`} className="fd-col">
          {!user && feedMode === 'followed' ? (
            <Empty
              title="Sign in to follow cinephiles."
              icon={Users}
              action={<button className="button primary" onClick={showAuth}>Sign In <ArrowUpRight size={16} /></button>}
            >
              Follow fellow members to build your custom, algorithm-free reverse chronological stream.
            </Empty>
          ) : loading ? (
            <FeedSkeleton />
          ) : visible.length === 0 ? (
            <Empty title="Your feed is quiet." icon={Activity}>
              {feedMode === 'followed'
                ? "You aren't following anyone yet or your friends haven't posted. Check out who to follow on the right or explore the Global Firehose!"
                : !showAi
                  ? "No human activity events found. Turn on 'AI Crew Visible' to see simulated community takes."
                  : "No public activity events found yet."}
            </Empty>
          ) : (
            <div className="fd-list" key={feedMode}>
              {visible.map((event, index) => {
                const meta = event.metadata || {};
                const name = event.user.displayName || event.user.username;
                const isTitle = event.targetType === 'title' || ['watched', 'rated', 'reviewed', 'added_to_watchlist', 'made_call'].includes(event.type);
                const titleName = meta.titleName || event.titleName || (event.type === 'made_call' ? 'upcoming release' : 'a film');
                const poster: string | null = meta.poster || event.poster || null;
                const rating = typeof meta.rating === 'number' ? meta.rating : null;
                const when = new Date(event.createdAt);
                return (
                  <article key={event.id} className="fd-card sx-lift sx-in" style={stagger(index)}>
                    <header className="fd-head">
                      <a href={`/u/${event.user.username}`} className="fd-avatar-link" aria-label={`${name}’s profile`}>
                        <RingAvatar name={name} src={event.user.avatarUrl} size={42} />
                      </a>
                      <div className="fd-who">
                        <div className="fd-name-row">
                          <a href={`/u/${event.user.username}`} className="fd-name">{name}</a>
                          {event.user.isAi && <AiBadge />}
                          <span className="fd-handle">@{event.user.username}</span>
                        </div>
                        <div className="fd-action">{renderEventAction(event)}</div>
                      </div>
                      <time className="fd-time" dateTime={event.createdAt} title={when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}>
                        {timeAgo(event.createdAt)}
                      </time>
                    </header>

                    {isTitle && (
                      <div className="fd-film">
                        <button type="button" className="fd-poster" onClick={() => openTitle(event.targetId)} aria-label={`Open ${titleName}`}>
                          {poster ? <img src={poster} alt="" loading="lazy" decoding="async" /> : <Film size={18} aria-hidden="true" />}
                          <span className="sx-shine" aria-hidden="true" />
                        </button>
                        <div className="fd-film-main">
                          <button type="button" className="fd-title" onClick={() => openTitle(event.targetId)}>{titleName}</button>
                          {rating !== null && rating > 0 && (
                            <span className="fd-stars" aria-label={`Rated ${ratingLabel(Math.min(rating, 5))} out of 5`}>
                              <span aria-hidden="true">{starText(Math.min(rating, 5))}</span>
                              <span className="fd-stars-rest" aria-hidden="true">{'★'.repeat(Math.max(0, 5 - Math.ceil(Math.min(rating, 5))))}</span>
                            </span>
                          )}
                          {meta.reviewBody && !meta.spoilerRedacted && (
                            <p className={`fd-quote ${meta.spoilerRevealed ? 'is-revealed' : ''}`}>{meta.reviewBody}</p>
                          )}
                          {meta.spoilerRedacted && (
                            <div className="fd-spoiler">
                              <span><EyeOff size={15} aria-hidden="true" /> Review withheld: contains spoilers for {titleName}.</span>
                              <button type="button" className="fd-spoiler-btn" onClick={() => handleRevealSpoiler(event.id)}>
                                <Eye size={13} aria-hidden="true" /> Reveal
                              </button>
                            </div>
                          )}
                          {meta.reason && <p className="fd-reason">“{meta.reason}”</p>}
                        </div>
                      </div>
                    )}

                    <div className="fd-foot">
                      <button
                        type="button"
                        className={`fd-act fd-like ${event.isLiked ? 'is-on' : ''} ${popId === event.id ? 'is-pop' : ''}`}
                        onClick={() => handleLike(event.id)}
                        aria-pressed={Boolean(event.isLiked)}
                        aria-label={`${event.isLiked ? 'Unlike' : 'Like'} this activity (${event.likesCount || 0} like${event.likesCount === 1 ? '' : 's'})`}
                      >
                        <span className="fd-heart"><Heart size={16} fill={event.isLiked ? 'currentColor' : 'none'} /></span>
                        <span className="fd-num" key={event.likesCount || 0}>{event.likesCount || 0}</span>
                      </button>
                      <button type="button" className="fd-act" onClick={() => openComments(event)}>
                        <MessageCircle size={16} aria-hidden="true" />
                        <span>Comments</span>
                      </button>
                      <span className="fd-type">{event.type.replace(/_/g, ' ')}</span>
                    </div>
                  </article>
                );
              })}

              {hasMore && (
                <div className="fd-more">
                  <button
                    className="button secondary"
                    disabled={loadingMore}
                    onClick={() => fetchFeed(feedMode, nextCursor)}
                  >
                    {loadingMore ? 'Loading older activity…' : 'Load More Activity'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: Who to Follow (Differentiator) */}
        <aside className="fd-side" aria-labelledby="fd-follow-heading">
          <div className="fd-side-card">
            <div className="fd-side-head">
              <Users size={17} aria-hidden="true" />
              <h3 id="fd-follow-heading">Who to Follow</h3>
            </div>
            <p className="fd-side-sub">Members who share films in common with your watch history.</p>

            {suggestions.length === 0 ? (
              <div className="fd-side-empty">
                Rate or log watched films in your library to discover members with matching taste!
              </div>
            ) : (
              <ul className="fd-sugg">
                {suggestions.map((s, i) => (
                  <li key={s.id} className="ex-in" style={stagger(i, 60)}>
                    <a href={`/u/${s.username}`} className="fd-sugg-who">
                      <RingAvatar name={s.displayName || s.username} src={s.avatarUrl} size={36} />
                      <span>
                        <b>{s.displayName || s.username}</b>
                        <small>{s.sharedFilmsCount > 0 ? `${s.sharedFilmsCount} shared film${s.sharedFilmsCount === 1 ? '' : 's'}` : 'Active Cinephile'}</small>
                      </span>
                    </a>
                    <button
                      type="button"
                      className="fd-follow"
                      onClick={() => handleFollowUser(s.username)}
                      aria-label={`Follow ${s.displayName || s.username}`}
                    >
                      <UserPlus size={13} aria-hidden="true" /> Follow
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Comments Drawer */}
      {activeCommentEvent && (
        <Modal label="Activity Discussion" onClose={() => setActiveCommentEvent(null)}>
          <div className="fd-comments">
            <div className="fd-comments-list">
              {comments.length === 0 ? (
                <p className="fd-comments-empty">No comments on this activity yet.</p>
              ) : (
                comments.map((c, i) => (
                  <div key={c.id} className="fd-comment ex-in" style={stagger(i, 30)}>
                    <RingAvatar name={c.user?.displayName || c.user?.username || 'User'} src={c.user?.avatarUrl} size={30} />
                    <div className="fd-comment-main">
                      <div className="fd-comment-head">
                        <b>{c.user?.displayName || c.user?.username || 'User'}</b>
                        <time dateTime={c.createdAt}>{timeAgo(c.createdAt)}</time>
                      </div>
                      <p>{c.body}</p>
                      {!c.isDeleted && <ReportButton targetType="comment" targetId={String(c.id)} authorId={String(c.userId)} />}
                    </div>
                  </div>
                ))
              )}
            </div>

            {user ? (
              <form onSubmit={handleAddComment} className="fd-comment-form">
                <input
                  type="text"
                  placeholder="Join the discussion…"
                  aria-label="Write a comment"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  disabled={commentBusy}
                />
                <button type="submit" className="button primary" disabled={commentBusy || !commentInput.trim()}>
                  {commentBusy ? 'Sending…' : 'Comment'}
                </button>
              </form>
            ) : (
              <div className="fd-comments-empty">Sign in to reply.</div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}

/** Stand-ins shaped like feed cards: avatar + two lines, then a poster beside text. */
function FeedSkeleton() {
  return (
    <div className="fd-list" aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="fd-card fd-skel-card ex-in" style={stagger(i, 70)}>
          <div className="fd-head">
            <div className="ex-skel fd-skel-avatar" />
            <div className="fd-who">
              <div className="ex-skel ex-skel-line" style={{ width: '38%' }} />
              <div className="ex-skel ex-skel-line" style={{ width: '58%', marginTop: 8 }} />
            </div>
          </div>
          <div className="fd-film">
            <div className="ex-skel fd-skel-poster" />
            <div className="fd-film-main">
              <div className="ex-skel ex-skel-line" style={{ width: '46%' }} />
              <div className="ex-skel ex-skel-line short" style={{ width: '28%' }} />
              {i % 2 === 0 && <div className="ex-skel fd-skel-quote" />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

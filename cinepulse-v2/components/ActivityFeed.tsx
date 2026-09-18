'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Activity, ArrowUpRight, Bookmark, Check, CheckCircle2, Eye, EyeOff,
  Film, Heart, Lock, MessageCircle, Sparkles, Star, UserPlus, Users
} from 'lucide-react';
import type { ActivityEvent, User } from '@/lib/types';
import { api } from './client';
import { Loading, Empty, Modal } from './UI';
import { useApp } from './Context';

export function ActivityFeed() {
  const { user, showAuth, openTitle } = useApp();
  const [feedMode, setFeedMode] = useState<'followed' | 'global'>('followed');
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);

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
    if (!cursor) setLoading(true);
    else setLoadingMore(true);

    const endpoint = mode === 'followed' ? '/feed' : '/feed/global';
    const url = cursor ? `${endpoint}?cursor=${encodeURIComponent(cursor)}` : endpoint;

    try {
      const res = await api<{ items: ActivityEvent[]; nextCursor: string | null; hasMore: boolean }>(url);
      if (cursor) {
        setItems((prev) => [...prev, ...(res.items || [])]);
      } else {
        setItems(res.items || []);
      }
      setNextCursor(res.nextCursor || null);
      setHasMore(Boolean(res.hasMore));
    } catch {
      if (!cursor) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchFeed(feedMode);
      api<{ suggestions: any[] }>('/suggestions/who-to-follow')
        .then((res) => setSuggestions(res.suggestions || []))
        .catch(() => {});
    } else {
      fetchFeed('global');
    }
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
      fetchFeed(feedMode);
    } catch (err: any) {
      showToast(err.message || 'Follow failed');
    }
  }

  function renderEventAction(event: ActivityEvent) {
    const meta = event.metadata || {};
    const authorName = event.user.displayName || event.user.username;

    switch (event.type) {
      case 'watched':
        return (
          <div>
            <span>watched </span>
            <strong style={{ color: '#fff', cursor: 'pointer' }} onClick={() => openTitle(event.targetId)}>
              {meta.titleName || 'a film'}
            </strong>
            {meta.rating !== undefined && meta.rating !== null && (
              <span style={{ color: '#fbbf24', marginLeft: '8px', fontWeight: 800 }}>★ {meta.rating}</span>
            )}
          </div>
        );
      case 'rated':
        return (
          <div>
            <span>rated </span>
            <strong style={{ color: '#fff', cursor: 'pointer' }} onClick={() => openTitle(event.targetId)}>
              {meta.titleName || 'a film'}
            </strong>
            <span style={{ color: '#fbbf24', marginLeft: '8px', fontWeight: 800 }}>★ {meta.rating}</span>
          </div>
        );
      case 'reviewed':
        return (
          <div>
            <span>reviewed </span>
            <strong style={{ color: '#fff', cursor: 'pointer' }} onClick={() => openTitle(event.targetId)}>
              {meta.titleName || 'a film'}
            </strong>
            {meta.rating !== undefined && meta.rating !== null && (
              <span style={{ color: '#fbbf24', marginLeft: '8px', fontWeight: 800 }}>★ {meta.rating}</span>
            )}
          </div>
        );
      case 'added_to_watchlist':
        return (
          <div>
            <span>added </span>
            <strong style={{ color: '#fff', cursor: 'pointer' }} onClick={() => openTitle(event.targetId)}>
              {meta.titleName || 'a film'}
            </strong>
            <span> to their watchlist</span>
          </div>
        );
      case 'made_call':
        return (
          <div>
            <span>called </span>
            <span style={{
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              background: meta.choice === 'hit' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: meta.choice === 'hit' ? '#34d399' : '#f87171',
              marginRight: '6px',
            }}>
              {meta.choice ? meta.choice.toUpperCase() : 'CALL'}
            </span>
            <span>on </span>
            <strong style={{ color: '#fff', cursor: 'pointer' }} onClick={() => openTitle(event.targetId)}>
              {meta.titleName || 'upcoming release'}
            </strong>
            {meta.confidence && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>({meta.confidence}% confidence)</span>}
          </div>
        );
      case 'created_list':
        return (
          <div>
            <span>created a new list: </span>
            <strong style={{ color: '#b3f3d5' }}>{meta.listName || 'Curated List'}</strong>
          </div>
        );
      case 'followed':
        return (
          <div>
            <span>started following </span>
            <a href={`/u/${meta.username}`} style={{ color: '#b3f3d5', fontWeight: 700 }}>
              @{meta.username}
            </a>
          </div>
        );
      default:
        return <span>shared an activity</span>;
    }
  }

  return (
    <section className="section space-page">
      {toastMsg && <div className="toast" role="status"><Check size={16} /> {toastMsg}</div>}

      <div className="space-heading">
        <span className="eyebrow mint">REVERSE-CHRONOLOGICAL SOCIAL FEED</span>
        <h1>What your circle<br />is watching & predicting.</h1>
        <p>Real activity from real members. No engagement-bait algorithms. No dwell-time ranking.</p>
      </div>

      {/* Product Differentiator Note */}
      <div className="glass" style={{
        padding: '16px 20px',
        borderRadius: '16px',
        border: '1px solid rgba(179, 243, 213, 0.25)',
        background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(11, 14, 18, 0.4) 100%)',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        marginBottom: '28px',
      }}>
        <Sparkles size={22} style={{ color: '#10b981', flexShrink: 0 }} />
        <div style={{ fontSize: '14px', color: '#cbd5e1' }}>
          <strong>Reverse-Chronological Promise:</strong> Every post appears strictly in the order it occurred.
          We don't manipulate your feed to maximize ad impressions.
        </div>
      </div>

      {/* Feed Mode Selector */}
      <div className="filter-bar" style={{ marginBottom: '24px' }}>
        <div className="segmented glass">
          <button
            className={feedMode === 'followed' ? 'active' : ''}
            onClick={() => setFeedMode('followed')}
          >
            Following ({user ? 'Chronological' : 'Requires Sign-in'})
          </button>
          <button
            className={feedMode === 'global' ? 'active' : ''}
            onClick={() => setFeedMode('global')}
          >
            Global Firehose
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '32px', alignItems: 'flex-start' }}>
        {/* Main Feed Column */}
        <div>
          {!user && feedMode === 'followed' ? (
            <Empty
              title="Sign in to follow cinephiles."
              icon={Users}
              action={<button className="button primary" onClick={showAuth}>Sign In <ArrowUpRight size={16} /></button>}
            >
              Follow fellow members to build your custom, algorithm-free reverse chronological stream.
            </Empty>
          ) : loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}><Loading /></div>
          ) : items.length === 0 ? (
            <Empty title="Your feed is quiet." icon={Activity}>
              {feedMode === 'followed'
                ? "You aren't following anyone yet or your friends haven't posted. Check out who to follow on the right or explore the Global Firehose!"
                : "No public activity events found yet."}
            </Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {items.map((event) => {
                const meta = event.metadata || {};
                return (
                  <div key={event.id} className="glass" style={{
                    padding: '20px 24px',
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {/* Header: User avatar + name + timestamp */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <a href={`/u/${event.user.username}`} style={{ textDecoration: 'none' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: event.user.avatarUrl ? `url(${event.user.avatarUrl}) center/cover` : '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '15px',
                          }}>
                            {!event.user.avatarUrl && (event.user.displayName || event.user.username).slice(0, 1).toUpperCase()}
                          </div>
                        </a>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <a href={`/u/${event.user.username}`} style={{ fontSize: '15px', fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                              {event.user.displayName || event.user.username}
                            </a>
                            <span style={{ fontSize: '13px', color: '#64748b' }}>@{event.user.username}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                            {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(event.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </div>

                      <span className="outline-pill" style={{ fontSize: '10px', textTransform: 'capitalize' }}>
                        {event.type.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Action Line */}
                    <div style={{ fontSize: '15px', color: '#cbd5e1', marginBottom: '14px', lineHeight: 1.5 }}>
                      {renderEventAction(event)}
                    </div>

                    {/* Attached content: review thoughts, reason */}
                    {meta.reviewBody && !meta.spoilerRedacted && (
                      <p style={{
                        fontSize: '14px',
                        color: '#e2e8f0',
                        background: 'rgba(255,255,255,0.02)',
                        borderLeft: '3px solid #10b981',
                        padding: '12px 16px',
                        borderRadius: '0 8px 8px 0',
                        margin: '12px 0',
                        lineHeight: 1.5,
                      }}>
                        "{meta.reviewBody}"
                      </p>
                    )}

                    {/* Server-Side Spoiler Protection Alert */}
                    {meta.spoilerRedacted && (
                      <div style={{
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        margin: '12px 0',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontSize: '13px' }}>
                          <EyeOff size={16} />
                          <span>Review withheld: Contains spoiler for {meta.titleName || 'film'}.</span>
                        </div>
                        <button
                          className="button secondary"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                          onClick={() => handleRevealSpoiler(event.id)}
                        >
                          Reveal Spoiler
                        </button>
                      </div>
                    )}

                    {meta.reason && (
                      <p style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', margin: '8px 0' }}>
                        Rationale: "{meta.reason}"
                      </p>
                    )}

                    {/* Footer: Likes, Comments */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '20px',
                      marginTop: '16px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <button
                        className="text-link"
                        onClick={() => handleLike(event.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', color: event.isLiked ? '#ef4444' : '#94a3b8' }}
                      >
                        <Heart size={16} fill={event.isLiked ? '#ef4444' : 'none'} />
                        <span>{event.likesCount || 0}</span>
                      </button>
                      <button
                        className="text-link"
                        onClick={() => openComments(event)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <MessageCircle size={16} />
                        <span>Comments</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '16px' }}>
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
        <div>
          <div className="glass" style={{
            padding: '24px',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Users size={18} style={{ color: '#10b981' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Who to Follow</h3>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.4 }}>
              Members who share films in common with your watch history.
            </p>

            {suggestions.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', padding: '16px 0' }}>
                Rate or log watched films in your library to discover members with matching taste!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {suggestions.map((s) => (
                  <div key={s.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}>
                    <a href={`/u/${s.username}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
                      <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: s.avatarUrl ? `url(${s.avatarUrl}) center/cover` : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '13px',
                        flexShrink: 0,
                      }}>
                        {!s.avatarUrl && (s.displayName || s.username).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                          {s.displayName || s.username}
                        </div>
                        <div style={{ fontSize: '11px', color: '#10b981' }}>
                          {s.sharedFilmsCount} shared film{s.sharedFilmsCount === 1 ? '' : 's'}
                        </div>
                      </div>
                    </a>

                    <button
                      className="button secondary"
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                      onClick={() => handleFollowUser(s.username)}
                    >
                      Follow
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comments Drawer */}
      {activeCommentEvent && (
        <Modal label="Activity Discussion" onClose={() => setActiveCommentEvent(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '500px' }}>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {comments.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>No comments on this activity yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.03)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{c.user?.displayName || c.user?.username || 'User'}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0 }}>{c.body}</p>
                  </div>
                ))
              )}
            </div>

            {user ? (
              <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Join the discussion…"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  disabled={commentBusy}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#fff',
                    outline: 'none',
                  }}
                />
                <button type="submit" className="button primary" disabled={commentBusy || !commentInput.trim()}>
                  {commentBusy ? 'Sending…' : 'Comment'}
                </button>
              </form>
            ) : (
              <div style={{ textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
                Sign in to reply.
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}

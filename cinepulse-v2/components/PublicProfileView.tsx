'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Activity, ArrowLeft, Bookmark, Calendar, Check, CheckCircle2, ChevronRight,
  Eye, EyeOff, Film, Heart, Lock, MessageCircle, MoreHorizontal, ShieldCheck,
  Sparkles, Star, TrendingDown, TrendingUp, UserCheck, UserPlus, UserX, Users, X
} from 'lucide-react';
import type { PublicProfile, Title, User } from '@/lib/types';
import { api } from './client';
import { Loading, Empty, Modal, Poster } from './UI';

interface PublicProfileViewProps {
  username: string;
  initialProfile?: PublicProfile | null;
  currentUser?: User | null;
  onBack?: () => void;
  onOpenTitle?: (id: string) => void;
}

export function PublicProfileView({
  username,
  currentUser,
  onBack,
  onOpenTitle,
}: PublicProfileViewProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'watchlist' | 'diary' | 'reviews' | 'lists' | 'predictions'>('watchlist');

  // Sub-resource states
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [diary, setDiary] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  // Differentiators
  const [tasteMatch, setTasteMatch] = useState<{ score: number | null; coWatchedCount: number; description?: string } | null>(null);
  const [mutualWatchlist, setMutualWatchlist] = useState<{ count: number; titles: any[]; description?: string } | null>(null);

  // Follow & block action states
  const [followBusy, setFollowBusy] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followModalList, setFollowModalList] = useState<any[]>([]);
  const [followModalTitle, setFollowModalTitle] = useState('');
  const [followModalLoading, setFollowModalLoading] = useState(false);

  // Comments modal state
  const [activeCommentsTarget, setActiveCommentsTarget] = useState<{ type: string; id: string; title: string } | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  // Notice / Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<PublicProfile>(`/users/${encodeURIComponent(username)}`);
      setProfile(data);

      // If profile is accessible, load taste match & mutual watchlist if viewer is logged in and not self
      if (currentUser && currentUser.username !== username && !data.isBlocked) {
        api<any>(`/users/${encodeURIComponent(username)}/match`).then(setTasteMatch).catch(() => {});
        api<any>(`/users/${encodeURIComponent(username)}/overlap`).then(setMutualWatchlist).catch(() => {});
      }
    } catch (e: any) {
      setError(e.message || 'Profile not found');
    } finally {
      setLoading(false);
    }
  }, [username, currentUser]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Load sub-resources when tab changes
  useEffect(() => {
    if (!profile) return;
    if (profile.profileVisibility === 'private' && !profile.isOwner && !profile.isFollowing) return;

    setSubLoading(true);
    if (tab === 'watchlist') {
      api<{ items: any[] }>(`/users/${encodeURIComponent(username)}/watchlist`)
        .then((res) => setWatchlist(res.items || []))
        .catch(() => setWatchlist([]))
        .finally(() => setSubLoading(false));
    } else if (tab === 'diary') {
      api<{ items: any[] }>(`/users/${encodeURIComponent(username)}/diary`)
        .then((res) => setDiary(res.items || []))
        .catch(() => setDiary([]))
        .finally(() => setSubLoading(false));
    } else if (tab === 'reviews') {
      api<{ items: any[] }>(`/users/${encodeURIComponent(username)}/reviews`)
        .then((res) => setReviews(res.items || []))
        .catch(() => setReviews([]))
        .finally(() => setSubLoading(false));
    } else if (tab === 'lists') {
      api<{ lists: any[] }>(`/users/${encodeURIComponent(username)}/lists`)
        .then((res) => setLists(res.lists || []))
        .catch(() => setLists([]))
        .finally(() => setSubLoading(false));
    } else if (tab === 'predictions') {
      api<any>(`/users/${encodeURIComponent(username)}/predictions`)
        .then((res) => setPredictions(res))
        .catch(() => setPredictions(null))
        .finally(() => setSubLoading(false));
    }
  }, [tab, profile, username]);

  // Follow / Unfollow
  async function handleToggleFollow() {
    if (!currentUser) {
      showToast('Please sign in to follow users.');
      return;
    }
    if (!profile) return;
    setFollowBusy(true);
    try {
      if (profile.isFollowing || profile.isPendingFollow) {
        await api(`/follows/${encodeURIComponent(username)}`, 'DELETE');
        setProfile((prev) => prev ? {
          ...prev,
          isFollowing: false,
          isPendingFollow: false,
          followerCount: Math.max(0, (prev.followerCount || 0) - (prev.isFollowing ? 1 : 0)),
        } : null);
        showToast(`Unfollowed @${username}.`);
      } else {
        const res = await api<{ status: 'accepted' | 'pending' }>(`/follows/${encodeURIComponent(username)}`, 'POST');
        const isAccepted = res.status === 'accepted';
        setProfile((prev) => prev ? {
          ...prev,
          isFollowing: isAccepted,
          isPendingFollow: !isAccepted,
          followerCount: isAccepted ? (prev.followerCount || 0) + 1 : prev.followerCount,
        } : null);
        showToast(isAccepted ? `You are now following @${username}!` : `Follow request sent to @${username}.`);
      }
    } catch (e: any) {
      showToast(e.message || 'Follow action failed');
    } finally {
      setFollowBusy(false);
    }
  }

  // Block / Unblock
  async function handleToggleBlock() {
    if (!currentUser || !profile) return;
    try {
      if (profile.isBlocked) {
        await api(`/blocks/${encodeURIComponent(username)}`, 'DELETE');
        setProfile((p) => p ? { ...p, isBlocked: false } : null);
        showToast(`Unblocked @${username}.`);
      } else {
        if (!confirm(`Are you sure you want to block @${username}? They won't be able to view your profile or follow you.`)) return;
        await api(`/blocks/${encodeURIComponent(username)}`, 'POST');
        setProfile((p) => p ? { ...p, isBlocked: true, isFollowing: false, isPendingFollow: false } : null);
        showToast(`Blocked @${username}.`);
      }
    } catch (e: any) {
      showToast(e.message || 'Action failed');
    }
  }

  // Open followers / following modal
  async function openFollowersModal(type: 'followers' | 'following') {
    setFollowModalTitle(type === 'followers' ? 'Followers' : 'Following');
    setFollowModalLoading(true);
    setShowFollowersModal(true);
    try {
      const res = await api<{ items: any[] }>(`/users/${encodeURIComponent(username)}/${type}`);
      setFollowModalList(res.items || []);
    } catch (e: any) {
      setFollowModalList([]);
    } finally {
      setFollowModalLoading(false);
    }
  }

  // Likes on review
  async function handleLikeReview(reviewId: string) {
    if (!currentUser) {
      showToast('Please sign in to like reviews.');
      return;
    }
    const rev = reviews.find((r) => r.id === reviewId);
    if (!rev) return;
    const nextLiked = !rev.isLiked;

    setReviews((prev) => prev.map((r) => r.id === reviewId ? {
      ...r,
      isLiked: nextLiked,
      likesCount: (r.likesCount || 0) + (nextLiked ? 1 : -1),
    } : r));

    try {
      await api('/likes', nextLiked ? 'POST' : 'DELETE', { targetType: 'review', targetId: reviewId });
    } catch {
      // Rollback
      setReviews((prev) => prev.map((r) => r.id === reviewId ? rev : r));
    }
  }

  // Reveal spoiler explicitly
  async function handleRevealSpoiler(reviewId: string) {
    try {
      await api(`/reviews/${reviewId}/reveal`, 'POST');
      // Reload reviews
      api<{ items: any[] }>(`/users/${encodeURIComponent(username)}/reviews`).then((res) => {
        setReviews(res.items || []);
      });
    } catch {}
  }

  // Comments modal
  async function openComments(type: string, id: string, titleName: string) {
    setActiveCommentsTarget({ type, id, title: titleName });
    setComments([]);
    try {
      const res = await api<{ comments: any[] }>(`/comments?targetType=${type}&targetId=${id}`);
      setComments(res.comments || []);
    } catch {}
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentInput.trim() || !activeCommentsTarget || !currentUser) return;
    setCommentBusy(true);
    try {
      const res = await api<{ comment: any }>('/comments', 'POST', {
        targetType: activeCommentsTarget.type,
        targetId: activeCommentsTarget.id,
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

  async function handleDeleteComment(commentId: number) {
    try {
      await api(`/comments/${commentId}`, 'DELETE');
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, body: '[Comment deleted]', isDeleted: true } : c));
    } catch (err: any) {
      showToast(err.message || 'Failed to delete comment');
    }
  }

  if (loading) {
    return <div className="space-page" style={{ padding: '60px 20px', textAlign: 'center' }}><Loading /></div>;
  }

  if (error || !profile) {
    return (
      <div className="space-page" style={{ padding: '60px 20px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        {onBack && (
          <button className="button secondary" onClick={onBack} style={{ marginBottom: '24px' }}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <div className="glass" style={{ padding: '40px 24px', borderRadius: '16px' }}>
          <UserX size={48} style={{ color: '#f87171', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Profile Unavailable</h2>
          <p style={{ color: '#94a3b8' }}>{error || 'The user you are looking for does not exist or has been removed.'}</p>
        </div>
      </div>
    );
  }

  const isSelf = Boolean(profile.isOwner || (currentUser && currentUser.username === profile.username));
  const isPrivate = profile.profileVisibility === 'private';
  const isGated = isPrivate && !isSelf && !profile.isFollowing;

  return (
    <div className="public-profile-page">
      {/* Toast Notification */}
      {toastMsg && <div className="toast" role="status"><Check size={16} /> {toastMsg}</div>}

      <div className="profile-container" style={{ maxWidth: '1080px', margin: '0 auto', padding: '32px 20px 80px' }}>
        {/* Navigation Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          {onBack ? (
            <button className="text-link" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowLeft size={18} /> Back
            </button>
          ) : (
            <a href="/" className="text-link" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowLeft size={18} /> Home
            </a>
          )}
          {!isSelf && currentUser && (
            <button
              className="text-link"
              onClick={handleToggleBlock}
              style={{ color: profile.isBlocked ? '#4ade80' : '#94a3b8', fontSize: '13px' }}
            >
              {profile.isBlocked ? 'Unblock user' : 'Block user'}
            </button>
          )}
        </div>

        {/* Profile Header Card */}
        <div className="glass profile-hero-card" style={{
          padding: '36px',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(23, 30, 42, 0.7) 0%, rgba(13, 17, 23, 0.9) 100%)',
          marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Avatar */}
              <div style={{
                width: '96px',
                height: '96px',
                borderRadius: '50%',
                background: profile.avatarUrl ? `url(${profile.avatarUrl}) center/cover` : 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                fontWeight: 800,
                color: '#fff',
                border: '3px solid rgba(179, 243, 213, 0.3)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              }}>
                {!profile.avatarUrl && (profile.displayName || profile.username).slice(0, 1).toUpperCase()}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
                    {profile.displayName || profile.username}
                  </h1>
                  {profile.isVerified && (
                    <span title="Verified Member" style={{ color: '#10b981', display: 'flex' }}><ShieldCheck size={20} /></span>
                  )}
                  {isPrivate && (
                    <span className="outline-pill" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Lock size={12} /> Private
                    </span>
                  )}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '15px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span>@{profile.username}</span>
                  <span>•</span>
                  <span>Joined {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                </div>
                {profile.bio && (
                  <p style={{ marginTop: '12px', fontSize: '15px', color: '#cbd5e1', maxWidth: '520px', lineHeight: 1.5 }}>
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>

            {/* Follow / Edit Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isSelf ? (
                <div className="outline-pill" style={{ color: '#b3f3d5', borderColor: 'rgba(179, 243, 213, 0.4)' }}>
                  Your Public Profile
                </div>
              ) : (
                <button
                  className={`button ${profile.isFollowing ? 'secondary' : profile.isPendingFollow ? 'secondary' : 'primary'}`}
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  style={{ minWidth: '140px', fontWeight: 600 }}
                >
                  {followBusy ? 'Updating…' : profile.isFollowing ? (
                    <><UserCheck size={16} /> Following</>
                  ) : profile.isPendingFollow ? (
                    <><Lock size={16} /> Requested</>
                  ) : (
                    <><UserPlus size={16} /> Follow</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Follow Counts & Quick Metrics */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '24px',
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <button
              className="text-link"
              onClick={() => openFollowersModal('followers')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <strong style={{ color: '#fff', fontSize: '16px' }}>{profile.followerCount || 0}</strong>
              <span style={{ color: '#94a3b8' }}>Followers</span>
            </button>
            <button
              className="text-link"
              onClick={() => openFollowersModal('following')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <strong style={{ color: '#fff', fontSize: '16px' }}>{profile.followingCount || 0}</strong>
              <span style={{ color: '#94a3b8' }}>Following</span>
            </button>

            {/* Taste Match Pill (CinePulse Differentiator) */}
            {tasteMatch && tasteMatch.score !== null && (
              <div style={{
                background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                padding: '6px 14px',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#b3f3d5',
                fontSize: '13px',
                fontWeight: 600,
              }}>
                <Sparkles size={14} style={{ color: '#10b981' }} />
                <span>Taste Match: {tasteMatch.score}% agreement</span>
              </div>
            )}

            {/* Mutual Watchlist Pill */}
            {mutualWatchlist && mutualWatchlist.count > 0 && (
              <div style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '6px 14px',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#7dd3fc',
                fontSize: '13px',
                fontWeight: 600,
              }}>
                <Film size={14} />
                <span>{mutualWatchlist.count} films you both want to watch</span>
              </div>
            )}
          </div>
        </div>

        {/* If private and non-follower: Gated View */}
        {isGated ? (
          <div className="glass" style={{
            padding: '60px 24px',
            textAlign: 'center',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <Lock size={44} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>This Account is Private</h2>
            <p style={{ color: '#94a3b8', maxWidth: '400px', margin: '0 auto 20px', fontSize: '15px' }}>
              {profile.isPendingFollow
                ? 'Your follow request is pending approval by this user.'
                : 'Follow this user to see their films, reviews, diary, and prediction calls.'}
            </p>
            {!profile.isPendingFollow && (
              <button className="button primary" onClick={handleToggleFollow}>
                <UserPlus size={16} /> Request to follow
              </button>
            )}
          </div>
        ) : (
          <>
            {/* CinePulse Core Differentiators Showcase */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
              marginBottom: '36px',
            }}>
              {/* Card 1: Prediction Call Accuracy & Brier Score (Hook) */}
              <div className="glass" style={{
                padding: '24px',
                borderRadius: '20px',
                border: '1px solid rgba(179, 243, 213, 0.2)',
                background: 'radial-gradient(ellipse at top left, rgba(16, 185, 129, 0.1) 0%, rgba(11, 14, 18, 0.8) 70%)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={20} style={{ color: '#10b981' }} />
                    <span className="eyebrow mint" style={{ fontSize: '11px', letterSpacing: '1.5px' }}>PREDICTION ACCURACY</span>
                  </div>
                  <span className="outline-pill" style={{ fontSize: '11px' }}>CinePulse Call Desk</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '32px', fontWeight: 800, color: '#b3f3d5', lineHeight: 1 }}>
                      {profile.stats.brierScore !== null ? profile.stats.brierScore.toFixed(3) : '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      Brier Score {profile.stats.brierScore !== null && <span style={{ color: '#10b981' }}>(Lower is better)</span>}
                    </div>
                  </div>

                  <div style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '16px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                      {profile.stats.hitRate !== null ? `${profile.stats.hitRate}%` : '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      Hit Rate on Calls
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                  {(profile.stats.totalPredictions || 0) > 0
                    ? `${profile.stats.totalPredictions} calls made (${profile.stats.totalPredictions} predictions logged). CinePulse's objective forecaster differentiator.`
                    : 'No resolved forecast calls yet. Make opening weekend predictions to unlock calibration stats.'}
                </p>
              </div>

              {/* Card 2: Film Statistics */}
              <div className="glass" style={{
                padding: '24px',
                borderRadius: '20px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Film size={20} style={{ color: '#38bdf8' }} />
                  <span className="eyebrow" style={{ color: '#7dd3fc', fontSize: '11px', letterSpacing: '1.5px' }}>WATCHING STATS</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#fff' }}>
                      {profile.stats.filmsWatchedThisYear}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>This Year</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#fff' }}>
                      {profile.stats.totalFilmsWatched}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Films</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#fbbf24' }}>
                      {profile.stats.averageRatingGiven ? `★ ${profile.stats.averageRatingGiven}` : '—'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Avg Rating</div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: '#64748b' }}>
                  {profile.stats.totalReviews} written review{profile.stats.totalReviews === 1 ? '' : 's'} recorded.
                </div>
              </div>
            </div>

            {/* Pinned Favorite Films (Max 4) */}
            {profile.favoriteFilms && profile.favoriteFilms.length > 0 && (
              <div style={{ marginBottom: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <Star size={18} style={{ color: '#fbbf24' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Favorite Films</h3>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Pinned</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                  {profile.favoriteFilms.map((film: any) => (
                    <div
                      key={film.id}
                      onClick={() => onOpenTitle?.(film.id)}
                      style={{ cursor: onOpenTitle ? 'pointer' : 'default', transition: 'transform 0.2s' }}
                    >
                      <div style={{
                        borderRadius: '12px',
                        overflow: 'hidden',
                        aspectRatio: '2/3',
                        background: '#1a2230',
                        position: 'relative',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}>
                        {film.poster ? (
                          <img src={film.poster} alt={film.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ padding: '16px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>{film.title}</div>
                        )}
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {film.title}
                      </div>
                      {film.releaseDate && (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{film.releaseDate.slice(0, 4)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="filter-bar" style={{ marginBottom: '24px' }}>
              <div className="segmented glass" style={{ width: '100%', overflowX: 'auto' }}>
                {[
                  ['watchlist', 'Watchlist'],
                  ['diary', 'Diary'],
                  ['reviews', 'Reviews'],
                  ['lists', 'Lists'],
                  ['predictions', 'Prediction Calls'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? 'active' : ''}
                    onClick={() => setTab(key as any)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Contents */}
            {subLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}><Loading /></div>
            ) : (
              <div>
                {/* Watchlist Tab */}
                {tab === 'watchlist' && (
                  watchlist.length === 0 ? (
                    <Empty title="Watchlist is empty." icon={Bookmark}>
                      No films in this watchlist yet.
                    </Empty>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '20px' }}>
                      {watchlist.map((item) => (
                        <div
                          key={item.titleId}
                          onClick={() => onOpenTitle?.(item.titleId)}
                          style={{ cursor: onOpenTitle ? 'pointer' : 'default' }}
                        >
                          <div style={{
                            borderRadius: '12px',
                            overflow: 'hidden',
                            aspectRatio: '2/3',
                            background: '#1a2230',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
                          }}>
                            {item.poster ? (
                              <img src={item.poster} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px' }}>{item.title}</div>
                            )}
                          </div>
                          <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600 }}>{item.title}</div>
                          {item.releaseDate && <div style={{ fontSize: '12px', color: '#64748b' }}>{item.releaseDate.slice(0, 4)}</div>}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Diary Tab */}
                {tab === 'diary' && (
                  diary.length === 0 ? (
                    <Empty title="No diary entries." icon={Calendar}>
                      This user hasn't logged any watched films to their diary.
                    </Empty>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {diary.map((entry) => (
                        <div key={entry.titleId + entry.watchedDate} className="glass" style={{
                          padding: '16px 20px',
                          borderRadius: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '20px',
                          justifyContent: 'space-between',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                              width: '48px',
                              height: '72px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              background: '#1a2230',
                              flexShrink: 0,
                            }}>
                              {entry.poster ? (
                                <img src={entry.poster} alt={entry.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : null}
                            </div>
                            <div>
                              <div
                                style={{ fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
                                onClick={() => onOpenTitle?.(entry.titleId)}
                              >
                                {entry.title}
                              </div>
                              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                                Watched on {new Date(entry.watchedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                              {entry.reviewBody && !entry.spoilerRedacted && (
                                <p style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '6px', fontStyle: 'italic' }}>
                                  "{entry.reviewBody}"
                                </p>
                              )}
                              {entry.spoilerRedacted && (
                                <div style={{ marginTop: '6px', fontSize: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <EyeOff size={14} /> Thoughts hidden to protect against spoilers.
                                </div>
                              )}
                            </div>
                          </div>

                          {entry.rating !== null && (
                            <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '18px', whiteSpace: 'nowrap' }}>
                              ★ {entry.rating}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Reviews Tab */}
                {tab === 'reviews' && (
                  reviews.length === 0 ? (
                    <Empty title="No reviews written." icon={MessageCircle}>
                      This user hasn't published any full reviews yet.
                    </Empty>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {reviews.map((rev) => (
                        <div key={rev.id} className="glass" style={{
                          padding: '24px',
                          borderRadius: '16px',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                              <h4
                                style={{ fontSize: '18px', fontWeight: 800, margin: 0, cursor: 'pointer' }}
                                onClick={() => onOpenTitle?.(rev.titleId)}
                              >
                                {rev.titleName}
                              </h4>
                              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                {new Date(rev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {rev.kind === 'first-impression' ? 'First Impression' : 'Review'}
                              </div>
                            </div>
                            {rev.rating !== null && (
                              <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '16px' }}>
                                ★ {rev.rating}
                              </div>
                            )}
                          </div>

                          {/* Review Body with Server-Side Spoiler Protection */}
                          {rev.spoilerRedacted ? (
                            <div style={{
                              background: 'rgba(245, 158, 11, 0.08)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              padding: '16px',
                              borderRadius: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              margin: '12px 0',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b', fontSize: '14px' }}>
                                <EyeOff size={18} />
                                <span>This review contains spoilers for {rev.titleName}.</span>
                              </div>
                              <button className="button secondary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => handleRevealSpoiler(rev.id)}>
                                Reveal Spoiler
                              </button>
                            </div>
                          ) : (
                            <p style={{ fontSize: '15px', color: '#e2e8f0', lineHeight: 1.6, margin: '14px 0', whiteSpace: 'pre-line' }}>
                              {rev.body}
                            </p>
                          )}

                          {/* Review Actions (Like, Comment) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <button
                              className="text-link"
                              onClick={() => handleLikeReview(rev.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: rev.isLiked ? '#ef4444' : '#94a3b8' }}
                            >
                              <Heart size={16} fill={rev.isLiked ? '#ef4444' : 'none'} />
                              <span>{rev.likesCount || 0}</span>
                            </button>
                            <button
                              className="text-link"
                              onClick={() => openComments('review', rev.id, rev.titleName)}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                              <MessageCircle size={16} />
                              <span>{rev.commentCount || 0} Comments</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Lists Tab */}
                {tab === 'lists' && (
                  lists.length === 0 ? (
                    <Empty title="No custom lists." icon={Film}>
                      No public lists created by this user yet.
                    </Empty>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                      {lists.map((l) => (
                        <div key={l.id} className="glass" style={{
                          padding: '24px',
                          borderRadius: '16px',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <h4 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{l.name}</h4>
                            <span className="outline-pill" style={{ fontSize: '11px', textTransform: 'capitalize' }}>
                              {l.visibility}
                            </span>
                          </div>
                          {l.description && (
                            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '8px 0 16px', lineHeight: 1.4 }}>
                              {l.description}
                            </p>
                          )}
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            {l.itemCount || 0} title{l.itemCount === 1 ? '' : 's'} • {l.isRanked ? 'Ranked' : 'Unranked'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Prediction Calls Tab */}
                {tab === 'predictions' && (
                  !predictions || !predictions.calls || predictions.calls.length === 0 ? (
                    <Empty title="No prediction calls on record." icon={Activity}>
                      No forecasts logged yet for upcoming releases.
                    </Empty>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {predictions.calls.map((call: any) => (
                        <div key={call.id} className="glass" style={{
                          padding: '20px',
                          borderRadius: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '20px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                              width: '44px',
                              height: '66px',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              background: '#1a2230',
                              flexShrink: 0,
                            }}>
                              {call.poster && <img src={call.poster} alt={call.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <div>
                              <div
                                style={{ fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
                                onClick={() => onOpenTitle?.(call.titleId)}
                              >
                                {call.title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                                <span style={{
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: call.choice === 'hit' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  color: call.choice === 'hit' ? '#34d399' : '#f87171',
                                }}>
                                  CALLED {call.choice.toUpperCase()}
                                </span>
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                  {call.confidence}% Confidence
                                </span>
                              </div>
                              {call.reason && (
                                <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
                                  "{call.reason}"
                                </p>
                              )}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span className="outline-pill" style={{ fontSize: '11px', color: call.isResolved ? '#34d399' : '#94a3b8' }}>
                              {call.isResolved ? 'Resolved' : 'Upcoming'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Followers / Following Modal */}
      {showFollowersModal && (
        <Modal label={followModalTitle} onClose={() => setShowFollowersModal(false)}>
          <div style={{ minHeight: '200px', maxHeight: '420px', overflowY: 'auto' }}>
            {followModalLoading ? (
              <Loading />
            ) : followModalList.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>No users found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {followModalList.map((u) => (
                  <div key={u.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.03)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        background: u.avatarUrl ? `url(${u.avatarUrl}) center/cover` : '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        color: '#fff',
                      }}>
                        {!u.avatarUrl && (u.displayName || u.username).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>{u.displayName || u.username}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>@{u.username}</div>
                      </div>
                    </div>
                    <a href={`/u/${u.username}`} className="button secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                      View Profile
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Comments Drawer / Modal */}
      {activeCommentsTarget && (
        <Modal label={`Comments: ${activeCommentsTarget.title}`} onClose={() => setActiveCommentsTarget(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '520px' }}>
            {/* Comments List */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {comments.length === 0 ? (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>No comments yet. Start the conversation!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: c.isDeleted ? '#64748b' : '#fff' }}>
                        {c.user?.displayName || c.user?.username || 'User'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {c.canDelete && !c.isDeleted && (
                          <button
                            className="text-link"
                            style={{ color: '#f87171', fontSize: '11px' }}
                            onClick={() => handleDeleteComment(c.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: '14px', color: c.isDeleted ? '#64748b' : '#cbd5e1', margin: 0, fontStyle: c.isDeleted ? 'italic' : 'normal' }}>
                      {c.body}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Post Comment Input */}
            {currentUser ? (
              <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Write a comment…"
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
                  {commentBusy ? 'Posting…' : 'Post'}
                </button>
              </form>
            ) : (
              <div style={{ textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
                Sign in to comment on this conversation.
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

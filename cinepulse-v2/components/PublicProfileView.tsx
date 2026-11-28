'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowLeft, Bookmark, Calendar, Check,
  EyeOff, Film, Lock, MessageCircle, ShieldCheck,
  Sparkles, UserCheck, UserPlus, UserX
} from 'lucide-react';
import type { PublicProfile, User } from '@/lib/types';
import { api } from './client';
import { Empty, Modal } from './UI';
import { TasteDnaView } from './TasteDnaView';
import { AiBadge } from './AiBadge';
import { ReviewSocial } from './ReviewThread';
import { FavouriteFour, FavouritesEditor, ProfileBanner } from './ProfileFavourites';
import { CountUp, RingAvatar, SlidingTabs, stagger, type SlidingTab } from './SocialMotion';
import './profile.css';

type ProfileTab = 'watchlist' | 'diary' | 'reviews' | 'lists' | 'predictions' | 'taste-dna';

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
  const [tab, setTab] = useState<ProfileTab>('watchlist');
  const router = useRouter();

  // Sub-resource states
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [diary, setDiary] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [tabErrors, setTabErrors] = useState<Record<string, string>>({});

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
  const [editingFavs, setEditingFavs] = useState(false);


  // Notice / Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    let redirecting = false;
    try {
      const data = await api<PublicProfile>(`/users/${encodeURIComponent(username)}`);
      // Found by a username the member has since changed: move the address to the current one.
      if (data.movedTo && /^[a-z0-9._-]{1,40}$/i.test(data.movedTo) && data.movedTo.toLowerCase() !== username.toLowerCase()
        && typeof window !== 'undefined' && window.location.pathname.startsWith('/u/')) {
        redirecting = true;
        router.replace(`/u/${encodeURIComponent(data.movedTo)}${window.location.search}${window.location.hash}`);
        return;
      }
      setProfile(data);

      // If profile is accessible, load taste match & mutual watchlist if viewer is logged in and not self
      if (currentUser && currentUser.username !== username && !data.isBlocked) {
        api<any>(`/users/${encodeURIComponent(username)}/match`).then(setTasteMatch).catch(() => {});
        api<any>(`/users/${encodeURIComponent(username)}/overlap`).then(setMutualWatchlist).catch(() => {});
      }
    } catch (e: any) {
      setError(e.message || 'Profile not found');
    } finally {
      if (!redirecting) setLoading(false);
    }
  }, [username, currentUser, router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // Signing in or out (or a new profile) changes what each tab may show: reload.
  useEffect(() => { setLoadedTabs(new Set()); setTabErrors({}); }, [username, currentUser?.id]);

  // Load each tab once, when it is first opened. Until then it shows a skeleton, never "empty".
  useEffect(() => {
    if (!profile || tab === 'taste-dna' || loadedTabs.has(tab)) return;
    if (profile.profileVisibility === 'private' && !profile.isOwner && !profile.isFollowing) return;
    const base = `/users/${encodeURIComponent(username)}`;
    let alive = true;
    const done = (fn: () => void) => { if (!alive) return; fn(); setLoadedTabs((s) => new Set(s).add(tab)); };
    const fail = (e: unknown) => done(() => setTabErrors((m) => ({ ...m, [tab]: (e as Error)?.message || 'Couldn’t load this right now' })));
    if (tab === 'watchlist') api<{ items: any[] }>(`${base}/watchlist`).then((r) => done(() => setWatchlist(r.items || []))).catch(fail);
    else if (tab === 'diary') api<{ items: any[] }>(`${base}/diary`).then((r) => done(() => setDiary(r.items || []))).catch(fail);
    else if (tab === 'reviews') api<{ items: any[] }>(`${base}/reviews`).then((r) => done(() => setReviews(r.items || []))).catch(fail);
    else if (tab === 'lists') api<{ lists: any[] }>(`${base}/lists`).then((r) => done(() => setLists(r.lists || []))).catch(fail);
    else if (tab === 'predictions') api<any>(`${base}/predictions`).then((r) => done(() => setPredictions(r))).catch(fail);
    return () => { alive = false; };
  }, [tab, profile, username, loadedTabs]);

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

  // Reveal spoiler explicitly
  async function handleRevealSpoiler(reviewId: string) {
    try {
      await api(`/reviews/${reviewId}/reveal`, 'POST');
      // Reload reviews
      const res = await api<{ items: any[] }>(`/users/${encodeURIComponent(username)}/reviews`);
      setReviews(res.items || []);
    } catch (e) {
      showToast((e as Error).message || 'Couldn’t reveal it right now');
    }
  }

  if (loading) {
    return <ProfileHeaderSkeleton />;
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
      {editingFavs && isSelf && (
        <FavouritesEditor
          films={profile.favoriteFilms || []}
          bannerUrl={profile.bannerUrl}
          onClose={() => setEditingFavs(false)}
          onSaved={(next) => {
            setProfile((p) => (p ? { ...p, favoriteFilms: next.favoriteFilms, bannerUrl: next.bannerUrl } : p));
            setEditingFavs(false);
            showToast('Favourites saved.');
          }}
        />
      )}
      {toastMsg && <div className="toast" role="status"><Check size={16} /> {toastMsg}</div>}

      <div className="profile-container pp-container">
        {/* Navigation Bar */}
        <div className="pp-nav">
          {onBack ? (
            <button className="text-link pp-back" onClick={onBack}>
              <ArrowLeft size={18} /> Back
            </button>
          ) : (
            <Link href="/" className="text-link pp-back">
              <ArrowLeft size={18} /> Home
            </Link>
          )}
          {!isSelf && currentUser && (
            <button
              className={`text-link pp-block ${profile.isBlocked ? 'is-blocked' : ''}`}
              onClick={handleToggleBlock}
            >
              {profile.isBlocked ? 'Unblock user' : 'Block user'}
            </button>
          )}
        </div>

        {/* Banner (Letterboxd-style backdrop behind the header) */}
        <ProfileBanner url={profile.bannerUrl} isOwner={isSelf} onEdit={() => setEditingFavs(true)} />

        {/* Profile Header Card */}
        <div className={`glass profile-hero-card pp-hero ${profile.bannerUrl ? 'has-banner' : ''}`}>
          <div className="pp-hero-glow" aria-hidden="true" />
          <div className="pp-hero-top">
            <div className="pp-identity">
              {/* Avatar */}
              <div className="pp-avatar-ring">
                <div
                  className="pp-avatar"
                  style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})` } : undefined}
                  role="img"
                  aria-label={`${profile.displayName || profile.username}’s avatar`}
                >
                  {!profile.avatarUrl && (profile.displayName || profile.username).slice(0, 1).toUpperCase()}
                </div>
              </div>

              <div className="pp-names">
                <div className="pp-name-row">
                  <h1>{profile.displayName || profile.username}</h1>
                  {profile.isAi && <AiBadge size="md" />}
                  {profile.isVerified && (
                    <span title="Verified Member" className="pp-verified"><ShieldCheck size={20} /></span>
                  )}
                  {isPrivate && (
                    <span className="outline-pill pp-private">
                      <Lock size={12} /> Private
                    </span>
                  )}
                </div>
                <div className="pp-handle">
                  <span>@{profile.username}</span>
                  <span aria-hidden="true">•</span>
                  <span>Joined {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                </div>
                {profile.bio && <p className="pp-bio">{profile.bio}</p>}
                {profile.isAi && (
                  <div className="persona-bio-footer">
                    <AiBadge />
                    <span>AI persona · created by CinePulse · seed v9</span>
                  </div>
                )}
              </div>
            </div>

            {/* Follow / Edit Button */}
            <div className="pp-cta">
              {isSelf ? (
                <div className="outline-pill pp-self-pill">
                  Your Public Profile
                </div>
              ) : (
                <button
                  className={`button pp-follow ${profile.isFollowing || profile.isPendingFollow ? 'secondary' : 'primary'}`}
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  aria-pressed={Boolean(profile.isFollowing)}
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
          <div className="pp-chips">
            <button type="button" className="pp-chip" onClick={() => openFollowersModal('followers')}>
              <b><CountUp value={profile.followerCount || 0} /></b>
              <small>Followers</small>
            </button>
            <button type="button" className="pp-chip" onClick={() => openFollowersModal('following')}>
              <b><CountUp value={profile.followingCount || 0} /></b>
              <small>Following</small>
            </button>
            {!isGated && (
              <>
                <div className="pp-chip is-static">
                  <b><CountUp value={profile.stats.totalFilmsWatched || 0} /></b>
                  <small>Films</small>
                </div>
                <div className="pp-chip is-static">
                  <b><CountUp value={profile.stats.totalReviews || 0} /></b>
                  <small>Reviews</small>
                </div>
              </>
            )}

            {/* Taste Match Pill (CinePulse Differentiator) */}
            {tasteMatch && tasteMatch.score !== null && (
              <div className="pp-pill is-mint">
                <Sparkles size={14} />
                <span>Taste Match: <CountUp value={tasteMatch.score} suffix="%" /> agreement</span>
              </div>
            )}

            {/* Mutual Watchlist Pill */}
            {mutualWatchlist && mutualWatchlist.count > 0 && (
              <div className="pp-pill is-sky">
                <Film size={14} />
                <span>{mutualWatchlist.count} films you both want to watch</span>
              </div>
            )}
          </div>
        </div>

        {/* If private and non-follower: Gated View */}
        {isGated ? (
          <div className="glass pp-gated sx-in">
            <Lock size={44} />
            <h2>This Account is Private</h2>
            <p>
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
            <div className="pp-stat-grid">
              {/* Card 1: Prediction Call Accuracy & Brier Score (Hook) */}
              <div className="glass pp-stat-card is-accuracy sx-lift sx-in" style={stagger(0, 80)}>
                <div className="pp-stat-head">
                  <div className="pp-stat-label">
                    <Activity size={18} />
                    <span className="eyebrow mint">PREDICTION ACCURACY</span>
                  </div>
                  <span className="outline-pill pp-stat-tag">CinePulse Call Desk</span>
                </div>

                <div className="pp-stat-row">
                  <div>
                    <div className="pp-big is-mint">
                      {profile.stats.brierScore !== null ? <CountUp value={profile.stats.brierScore} decimals={3} /> : '—'}
                    </div>
                    <div className="pp-big-label">
                      Brier Score {profile.stats.brierScore !== null && <span className="pp-hint">(Lower is better)</span>}
                    </div>
                  </div>
                  <div className="pp-stat-sep">
                    <div className="pp-big">
                      {profile.stats.hitRate != null ? <CountUp value={profile.stats.hitRate} suffix="%" /> : '—'}
                    </div>
                    <div className="pp-big-label">Hit Rate on Calls</div>
                  </div>
                </div>

                <p className="pp-stat-note">
                  {(profile.stats.totalPredictions || 0) > 0
                    ? `${profile.stats.totalPredictions} calls made (${profile.stats.totalPredictions} predictions logged). CinePulse's objective forecaster differentiator.`
                    : 'No resolved forecast calls yet. Make opening weekend predictions to unlock calibration stats.'}
                </p>
              </div>

              {/* Card 2: Film Statistics */}
              <div className="glass pp-stat-card sx-lift sx-in" style={stagger(1, 80)}>
                <div className="pp-stat-label">
                  <Film size={18} className="pp-sky" />
                  <span className="eyebrow pp-sky">WATCHING STATS</span>
                </div>

                <div className="pp-stat-trio">
                  <div>
                    <div className="pp-mid"><CountUp value={profile.stats.filmsWatchedThisYear || 0} /></div>
                    <div className="pp-big-label">This Year</div>
                  </div>
                  <div>
                    <div className="pp-mid"><CountUp value={profile.stats.totalFilmsWatched || 0} /></div>
                    <div className="pp-big-label">Total Films</div>
                  </div>
                  <div>
                    <div className="pp-mid is-gold">
                      {profile.stats.averageRatingGiven ? <CountUp value={profile.stats.averageRatingGiven} decimals={Math.min(2, (String(profile.stats.averageRatingGiven).split('.')[1] || '').length)} prefix="★ " /> : '—'}
                    </div>
                    <div className="pp-big-label">Avg Rating</div>
                  </div>
                </div>

                <div className="pp-stat-foot">
                  {profile.stats.totalReviews} written review{profile.stats.totalReviews === 1 ? '' : 's'} recorded.
                </div>
              </div>
            </div>

            {/* Favourite four (Letterboxd-style); owners can pick them and the banner */}
            <FavouriteFour
              films={profile.favoriteFilms || []}
              isOwner={isSelf}
              onOpenTitle={onOpenTitle}
              onEdit={() => setEditingFavs(true)}
            />

            {/* Navigation Tabs */}
            <div className="pp-tabs">
              <SlidingTabs
                tabs={PROFILE_TABS}
                value={tab}
                onChange={setTab}
                label="Profile sections"
                idPrefix="profile-tab"
                panelId="profile-panel"
              />
            </div>

            {/* Tab Contents */}
            <div id="profile-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} className="pp-panel">
            {tab !== 'taste-dna' && !loadedTabs.has(tab) ? (
              <ProfileTabSkeleton tab={tab} />
            ) : tab !== 'taste-dna' && tabErrors[tab] ? (
              <Empty title={/private|hidden|follow|not allowed|forbidden/i.test(tabErrors[tab]) ? 'This section is private.' : 'Couldn’t load this.'} icon={Lock}>
                {/private|hidden|follow|not allowed|forbidden/i.test(tabErrors[tab]) ? `${profile.displayName || profile.username} has chosen not to show this on their profile.` : tabErrors[tab]}
                {!/private|hidden|follow|not allowed|forbidden/i.test(tabErrors[tab]) && (
                  <div style={{ marginTop: 12 }}><button type="button" className="button secondary" onClick={() => { setTabErrors((m) => { const n = { ...m }; delete n[tab]; return n; }); setLoadedTabs((st) => { const n = new Set(st); n.delete(tab); return n; }); }}>Try again</button></div>
                )}
              </Empty>
            ) : (
              <div className="sx-panel" key={tab}>
                {/* Watchlist Tab */}
                {tab === 'watchlist' && (
                  watchlist.length === 0 ? (
                    <Empty title={isSelf ? 'Your watchlist is empty.' : 'Watchlist is empty.'} icon={Bookmark}>
                      {isSelf ? 'Tap Watchlist on any film to save it for later — it shows up here.' : 'No films in this watchlist yet.'}
                    </Empty>
                  ) : (
                    <div className="pp-grid">
                      {watchlist.map((item, i) => (
                        <div key={item.titleId} className="pp-film sx-in" style={stagger(i, 35)}>
                          <button
                            type="button"
                            className="pp-poster"
                            onClick={() => onOpenTitle?.(item.titleId)}
                            disabled={!onOpenTitle}
                            aria-label={`${item.title}${item.releaseDate ? ` (${String(item.releaseDate).slice(0, 4)})` : ''}`}
                          >
                            {item.poster ? (
                              <img src={item.poster} alt="" loading="lazy" decoding="async" />
                            ) : (
                              <span className="pp-poster-ph">{item.title}</span>
                            )}
                            <span className="pp-shine" aria-hidden="true" />
                          </button>
                          <div className="pp-film-title">{item.title}</div>
                          {item.releaseDate && <div className="pp-film-year">{String(item.releaseDate).slice(0, 4)}</div>}
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
                    <div className="pp-rows">
                      {diary.map((entry, i) => (
                        <div key={entry.entryId || entry.titleId + entry.watchedDate} className="glass pp-row sx-lift sx-in" style={stagger(i, 40)}>
                          <div className="pp-row-main">
                            <button type="button" className="pp-thumb" onClick={() => onOpenTitle?.(entry.titleId)} disabled={!onOpenTitle} aria-label={`Open ${entry.title}`}>
                              {entry.poster ? <img src={entry.poster} alt="" loading="lazy" decoding="async" /> : null}
                            </button>
                            <div className="pp-row-text">
                              <button type="button" className="pp-row-title" onClick={() => onOpenTitle?.(entry.titleId)} disabled={!onOpenTitle}>
                                {entry.title}
                              </button>
                              <div className="pp-row-sub">
                                {entry.rewatch ? 'Rewatched' : 'Watched'} on {new Date(String(entry.watchedDate).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                              </div>
                              {entry.reviewBody && !entry.spoilerRedacted && (
                                <p className="pp-row-quote">“{entry.reviewBody}”</p>
                              )}
                              {entry.spoilerRedacted && (
                                <div className="pp-row-spoiler">
                                  <EyeOff size={14} /> Thoughts hidden to protect against spoilers.
                                </div>
                              )}
                            </div>
                          </div>

                          {entry.rating !== null && entry.rating !== undefined && (
                            <div className="pp-row-rating" aria-label={`Rated ${entry.rating} out of 5`}>
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
                    <div className="pp-rows is-loose">
                      {reviews.map((rev, i) => (
                        <div key={rev.id} className="glass pp-review sx-in" style={stagger(i, 50)}>
                          <div className="pp-review-head">
                            <div className="pp-review-meta">
                              <h4>
                                <button type="button" className="pp-row-title" onClick={() => onOpenTitle?.(rev.titleId)} disabled={!onOpenTitle}>
                                  {rev.titleName}
                                </button>
                              </h4>
                              <div className="pp-row-sub">
                                {new Date(rev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {rev.kind === 'first-impression' ? 'First Impression' : 'Review'}
                              </div>
                            </div>
                            {rev.rating !== null && rev.rating !== undefined && (
                              <div className="pp-row-rating" aria-label={`Rated ${rev.rating} out of 5`}>
                                ★ {rev.rating}
                              </div>
                            )}
                          </div>

                          {/* Review Body with Server-Side Spoiler Protection */}
                          {rev.spoilerRedacted ? (
                            <div className="pp-spoiler">
                              <div className="pp-spoiler-text">
                                <EyeOff size={18} />
                                <span>This review contains spoilers for {rev.titleName}.</span>
                              </div>
                              <button className="button secondary pp-spoiler-btn" onClick={() => handleRevealSpoiler(rev.id)}>
                                Reveal Spoiler
                              </button>
                            </div>
                          ) : (
                            <p className="pp-review-body">{rev.body}</p>
                          )}

                          {/* Likes and comments, with the thread inline */}
                          <ReviewSocial reviewId={rev.id} authorName={profile.displayName || profile.username} likesCount={rev.likesCount || 0} commentsCount={rev.commentCount || 0} viewerLiked={Boolean(rev.isLiked)} />
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
                    <div className="pp-list-grid">
                      {lists.map((l, i) => (
                        <div key={l.id} className="glass pp-list sx-lift sx-in" style={stagger(i, 45)}>
                          <div className="pp-list-head">
                            <h4>{l.name}</h4>
                            <span className="outline-pill pp-list-vis">{l.visibility}</span>
                          </div>
                          {l.description && <p className="pp-list-desc">{l.description}</p>}
                          <div className="pp-list-meta">
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
                    <div className="pp-rows">
                      {predictions.calls.map((call: any, i: number) => (
                        <div key={call.id} className="glass pp-row sx-lift sx-in" style={stagger(i, 40)}>
                          <div className="pp-row-main">
                            <button type="button" className="pp-thumb is-small" onClick={() => onOpenTitle?.(call.titleId)} disabled={!onOpenTitle} aria-label={`Open ${call.title}`}>
                              {call.poster && <img src={call.poster} alt="" loading="lazy" decoding="async" />}
                            </button>
                            <div className="pp-row-text">
                              <button type="button" className="pp-row-title" onClick={() => onOpenTitle?.(call.titleId)} disabled={!onOpenTitle}>
                                {call.title}
                              </button>
                              <div className="pp-call-meta">
                                <span className={`pp-call ${call.choice === 'hit' ? 'is-hit' : 'is-flop'}`}>
                                  CALLED {String(call.choice).toUpperCase()}
                                </span>
                                <span className="pp-row-sub">{call.confidence}% Confidence</span>
                              </div>
                              {call.reason && <p className="pp-row-quote is-plain">“{call.reason}”</p>}
                            </div>
                          </div>

                          <span className={`outline-pill pp-call-state ${call.isResolved ? 'is-resolved' : ''}`}>
                            {call.isResolved ? 'Resolved' : 'Upcoming'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Taste DNA Tab */}
                {tab === 'taste-dna' && (
                  <TasteDnaView
                    username={username}
                    userRatingCount={profile.stats.totalFilmsWatched}
                  />
                )}
              </div>
            )}
            </div>
          </>
        )}
      </div>

      {/* Followers / Following Modal */}
      {showFollowersModal && (
        <Modal label={followModalTitle} onClose={() => setShowFollowersModal(false)}>
          <div className="pp-follow-modal">
            {followModalLoading ? (
              <div className="pp-follow-list" aria-busy="true" aria-label="Loading">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel pp-follow-skel" />)}
              </div>
            ) : followModalList.length === 0 ? (
              <p className="pp-follow-empty">No users found.</p>
            ) : (
              <div className="pp-follow-list">
                {followModalList.map((u, i) => (
                  <div key={u.id} className="pp-follow-row ex-in" style={stagger(i, 30)}>
                    <div className="pp-follow-who">
                      <RingAvatar name={u.displayName || u.username} src={u.avatarUrl} size={38} />
                      <div>
                        <div className="pp-follow-name">{u.displayName || u.username}</div>
                        <div className="pp-follow-handle">@{u.username}</div>
                      </div>
                    </div>
                    <a href={`/u/${u.username}`} className="button secondary pp-follow-view">
                      View Profile
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

    </div>
  );
}

const PROFILE_TABS: SlidingTab<ProfileTab>[] = [
  { id: 'watchlist', label: 'Watchlist', Icon: Bookmark },
  { id: 'diary', label: 'Diary', Icon: Calendar },
  { id: 'reviews', label: 'Reviews', Icon: MessageCircle },
  { id: 'taste-dna', label: 'Taste DNA', Icon: Sparkles },
  { id: 'lists', label: 'Lists', Icon: Film },
  { id: 'predictions', label: 'Prediction Calls', Icon: Activity },
];

/** Header-shaped placeholder while the profile itself loads. */
function ProfileHeaderSkeleton() {
  return (
    <div className="public-profile-page">
      <div className="profile-container pp-container" aria-busy="true" aria-label="Loading profile">
        <div className="ex-skel pp-skel-nav" />
        <div className="glass pp-hero">
          <div className="pp-hero-top">
            <div className="pp-identity">
              <div className="ex-skel pp-skel-avatar" />
              <div className="pp-names" style={{ flex: 1, minWidth: 180 }}>
                <div className="ex-skel pp-skel-line" style={{ width: '55%', height: 26 }} />
                <div className="ex-skel pp-skel-line" style={{ width: '35%' }} />
                <div className="ex-skel pp-skel-line" style={{ width: '75%' }} />
              </div>
            </div>
          </div>
          <div className="pp-chips">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel pp-skel-chip" />)}
          </div>
        </div>
        <div className="pp-stat-grid">
          <div className="ex-skel pp-skel-card" />
          <div className="ex-skel pp-skel-card" />
        </div>
      </div>
    </div>
  );
}

/** Shimmering stand-ins shaped like each tab's content while it loads. */
function ProfileTabSkeleton({ tab }: { tab: string }) {
  if (tab === 'watchlist') {
    return (
      <div aria-busy="true" aria-label="Loading" className="pp-grid">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ex-skel-film"><div className="ex-skel ex-skel-poster" /><div className="ex-skel ex-skel-line" /><div className="ex-skel ex-skel-line short" /></div>)}
      </div>
    );
  }
  if (tab === 'lists') {
    return (
      <div aria-busy="true" aria-label="Loading" className="pp-list-grid">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel" style={{ height: 132, borderRadius: 18 }} />)}
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-label="Loading" className="pp-rows">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="glass pp-row pp-skel-row">
          <div className="pp-row-main">
            <div className="ex-skel pp-thumb" />
            <div className="pp-row-text" style={{ flex: 1 }}>
              <div className="ex-skel pp-skel-line" style={{ width: '40%' }} />
              <div className="ex-skel pp-skel-line" style={{ width: '26%' }} />
              {tab === 'reviews' && <div className="ex-skel pp-skel-line" style={{ width: '85%', height: 40 }} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

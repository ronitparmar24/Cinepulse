'use client';
import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowLeft, Bookmark, Calendar, Check, EyeOff, Film, Lock, MapPin,
  MessageCircle, Pencil, Share2, ShieldCheck, Sparkles, Star, UserCheck, UserPlus, UserX
} from 'lucide-react';
import type { PublicProfile, User } from '@/lib/types';
import { api } from './client';
import { Empty, Modal } from './UI';
import { TasteDnaView } from './TasteDnaView';
import { AiBadge } from './AiBadge';
import { ReviewSocial } from './ReviewThread';
import { FavouriteFour, FavouritesEditor, ProfileBanner } from './ProfileFavourites';
import { CountUp, ProgressRing, RingAvatar, SlidingTabs, nameHue, stagger, useInView, type SlidingTab } from './SocialMotion';
import './profile.css';

// Fetched the first time they are opened.
const ShareSheet = dynamic(() => import('./ShareSheet').then((m) => m.ShareSheet), { ssr: false });
const ProfileDialog = dynamic(() => import('./Account').then((m) => m.ProfileDialog), { ssr: false });

type ProfileTab = 'watchlist' | 'diary' | 'reviews' | 'lists' | 'predictions' | 'taste-dna';

interface PublicProfileViewProps {
  username: string;
  initialProfile?: PublicProfile | null;
  currentUser?: User | null;
  onBack?: () => void;
  onOpenTitle?: (id: string) => void;
}

const REGIONS: Record<string, string> = { IN: 'India', US: 'United States' };

/** Short, stable fingerprint of what the share card shows, so a new card is made after edits. */
function cardVersion(p: PublicProfile): string {
  const src = JSON.stringify([
    p.username, p.displayName, p.avatarUrl, p.bannerUrl, (p.favoriteFilms || []).map((f: any) => f.id),
    p.followerCount, p.stats.totalFilmsWatched, p.stats.totalReviews, p.topGenres, p.showPredictionSummary, p.stats.hitRate,
  ]);
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
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
  const [followModalList, setFollowModalList] = useState<any[]>([]);
  const [followModalTitle, setFollowModalTitle] = useState('');
  const [followModalLoading, setFollowModalLoading] = useState(false);
  const [editingFavs, setEditingFavs] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);

  // Notice / Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  }, []);

  const loadProfile = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
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

  const version = useMemo(() => (profile ? cardVersion(profile) : '1'), [profile]);

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

  // "Show prediction summary on my profile"
  async function handleToggleSummary(show: boolean) {
    if (!profile) return;
    setSummaryBusy(true);
    setProfile((p) => (p ? { ...p, showPredictionSummary: show } : p));
    try {
      await api('/profile/prediction-summary', 'PUT', { show });
      showToast(show ? 'Your prediction summary is on your profile.' : 'Prediction summary hidden from others.');
    } catch (e) {
      setProfile((p) => (p ? { ...p, showPredictionSummary: !show } : p));
      showToast((e as Error).message || 'Couldn’t save that right now');
    } finally {
      setSummaryBusy(false);
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
    } catch {
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
      <div className="public-profile-page pp2">
        <div className="profile-container pp-container pp2-missing">
          {onBack && (
            <button className="button secondary" onClick={onBack} style={{ marginBottom: '24px' }}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <div className="glass pp2-missing-card sx-in">
            <UserX size={48} />
            <h2>Profile unavailable</h2>
            <p>{error || 'The user you are looking for does not exist or has been removed.'}</p>
            <Link href="/" className="button secondary">Back to CinePulse</Link>
          </div>
        </div>
      </div>
    );
  }

  const isSelf = Boolean(profile.isOwner || (currentUser && currentUser.username === profile.username));
  const isPrivate = profile.profileVisibility === 'private';
  const isGated = isPrivate && !isSelf && !profile.isFollowing;
  const name = profile.displayName || profile.username;
  const favs = profile.favoriteFilms || [];
  const washArt = profile.bannerUrl || favs.find((f: any) => f.backdrop)?.backdrop || favs.find((f: any) => f.poster)?.poster || null;
  const showSummary = profile.showPredictionSummary !== false;
  const summaryCard = isSelf || showSummary;
  const topGenres = profile.topGenres || [];
  const avgRating = profile.stats.averageRatingGiven ?? profile.stats.averageRating ?? null;
  const region = profile.region ? REGIONS[profile.region] || profile.region : null;
  const joined = new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const hue = nameHue(name);

  return (
    <div className="public-profile-page pp2">
      {editingFavs && isSelf && (
        <FavouritesEditor
          films={favs}
          bannerUrl={profile.bannerUrl}
          onClose={() => setEditingFavs(false)}
          onSaved={(next) => {
            setProfile((p) => (p ? { ...p, favoriteFilms: next.favoriteFilms, bannerUrl: next.bannerUrl } : p));
            setEditingFavs(false);
            showToast('Favourites saved.');
          }}
        />
      )}
      {sharing && (
        <ShareSheet kind="profile" id={profile.username} title={name} version={version} own={isSelf} onClose={() => setSharing(false)} />
      )}
      {editingProfile && isSelf && (
        <ProfileDialog initialTab="edit" onClose={() => { setEditingProfile(false); void loadProfile(true); }} />
      )}
      {toastMsg && <div className="toast" role="status"><Check size={16} /> {toastMsg}</div>}

      {/* Full-bleed stage: banner (parallax-lite) over a soft colour wash taken from the art */}
      <div className="pp2-stage">
        <div className="pp2-wash" aria-hidden="true">
          {washArt ? <img src={washArt} alt="" decoding="async" /> : <span className="pp2-wash-aurora" />}
        </div>
        <ProfileBanner url={profile.bannerUrl} isOwner={isSelf} onEdit={() => setEditingFavs(true)} />
        <div className="pp2-nav">
          {onBack ? (
            <button className="pp2-navbtn" onClick={onBack}><ArrowLeft size={16} /> Back</button>
          ) : (
            <Link href="/" className="pp2-navbtn"><ArrowLeft size={16} /> Home</Link>
          )}
          {!isSelf && currentUser && (
            <button className={`pp2-navbtn is-quiet ${profile.isBlocked ? 'is-blocked' : ''}`} onClick={handleToggleBlock}>
              {profile.isBlocked ? 'Unblock user' : 'Block user'}
            </button>
          )}
        </div>
      </div>

      <div className="profile-container pp-container pp2-container">
        {/* Header: avatar overlapping the banner, identity, actions */}
        <header className="pp2-head">
          <div className="pp2-avatar" style={{ ['--hue' as string]: hue } as CSSProperties}>
            <span className="pp2-avatar-ring" aria-hidden="true" />
            <AvatarImage name={name} src={profile.avatarUrl} />
          </div>

          <div className="pp2-id">
            <div className="pp2-name-row">
              <h1>{name}</h1>
              {profile.isAi && <AiBadge size="md" />}
              {profile.isVerified && (
                <span title="Verified member" className="pp-verified"><ShieldCheck size={20} /><span className="sr-only">Verified member</span></span>
              )}
              {isPrivate && (
                <span className="pp2-tag"><Lock size={12} /> Private</span>
              )}
              {isSelf && <span className="pp2-tag is-mint">You</span>}
            </div>
            <div className="pp2-meta">
              <span className="pp2-handle">@{profile.username}</span>
              <span><Calendar size={13} aria-hidden="true" /> Joined {joined}</span>
              {region && <span><MapPin size={13} aria-hidden="true" /> {region}</span>}
            </div>
            {profile.bio && <p className="pp2-bio">{profile.bio}</p>}
            {profile.isAi && (
              <div className="persona-bio-footer">
                <AiBadge />
                <span>AI persona · created by CinePulse · seed v9</span>
              </div>
            )}
          </div>

          <div className="pp2-actions">
            {isSelf ? (
              <button type="button" className="button secondary pp2-action" onClick={() => setEditingProfile(true)}>
                <Pencil size={15} /> Edit profile
              </button>
            ) : (
              <button
                type="button"
                className={`button pp2-action pp2-follow ${profile.isFollowing || profile.isPendingFollow ? 'secondary is-on' : 'primary'}`}
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
            {!isGated && (
              <button type="button" className="button secondary pp2-action pp2-share" onClick={() => setSharing(true)} aria-label={isSelf ? 'Share your profile' : `Share ${name}’s profile`}>
                <Share2 size={15} /> <span>Share</span>
              </button>
            )}
          </div>
        </header>

        {/* Stat chips with count-up */}
        <div className="pp2-chips">
          <button type="button" className="pp2-chip sx-in" style={stagger(0, 60)} onClick={() => openFollowersModal('followers')}>
            <b><CountUp value={profile.followerCount || 0} /></b>
            <small>Followers</small>
          </button>
          <button type="button" className="pp2-chip sx-in" style={stagger(1, 60)} onClick={() => openFollowersModal('following')}>
            <b><CountUp value={profile.followingCount || 0} /></b>
            <small>Following</small>
          </button>
          {!isGated && (
            <>
              <div className="pp2-chip is-static sx-in" style={stagger(2, 60)}>
                <b><CountUp value={profile.stats.totalFilmsWatched || 0} /></b>
                <small>Films</small>
              </div>
              <div className="pp2-chip is-static sx-in" style={stagger(3, 60)}>
                <b><CountUp value={profile.stats.totalReviews || 0} /></b>
                <small>Reviews</small>
              </div>
            </>
          )}
        </div>

        {(tasteMatch?.score != null || (mutualWatchlist && mutualWatchlist.count > 0)) && (
          <div className="pp2-pills">
            {tasteMatch && tasteMatch.score !== null && (
              <div className="pp-pill is-mint sx-in">
                <Sparkles size={14} />
                <span>Taste match: <CountUp value={tasteMatch.score} suffix="%" /> agreement</span>
              </div>
            )}
            {mutualWatchlist && mutualWatchlist.count > 0 && (
              <div className="pp-pill is-sky sx-in" style={stagger(1, 80)}>
                <Film size={14} />
                <span>{mutualWatchlist.count} film{mutualWatchlist.count === 1 ? '' : 's'} you both want to watch</span>
              </div>
            )}
          </div>
        )}

        {isGated ? (
          <div className="glass pp-gated sx-in">
            <Lock size={44} />
            <h2>This account is private</h2>
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
            {/* Favourite four: big tilted prints that straighten on hover */}
            <FavouriteFour
              films={favs}
              isOwner={isSelf}
              onOpenTitle={onOpenTitle}
              onEdit={() => setEditingFavs(true)}
            />

            {/* Taste strip */}
            {(topGenres.length > 0 || avgRating) && (
              <section className="pp2-taste sx-in" aria-label="Taste">
                <span className="pp2-taste-label"><Sparkles size={14} aria-hidden="true" /> Taste</span>
                {topGenres.length > 0 && (
                  <ul className="pp2-genres">
                    {topGenres.map((g, i) => <li key={g} className="pp2-genre" style={stagger(i, 70)}>{g}</li>)}
                  </ul>
                )}
                {avgRating ? (
                  <span className="pp2-avg">
                    <StarMeter value={avgRating} />
                    <b>{avgRating.toFixed(1)}</b>
                    <small>avg rating</small>
                  </span>
                ) : null}
              </section>
            )}

            {/* Compact glassy stat cards */}
            <div className={`pp2-cards ${summaryCard ? '' : 'is-single'}`}>
              {summaryCard && (
                <PredictionCard
                  profile={profile}
                  isSelf={isSelf}
                  show={showSummary}
                  busy={summaryBusy}
                  onToggle={handleToggleSummary}
                />
              )}
              <WatchingCard profile={profile} />
            </div>

            {/* Navigation Tabs */}
            <div className="pp-tabs pp2-tabs">
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
            <div id="profile-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`} className="pp-panel" tabIndex={0}>
            {tab !== 'taste-dna' && !loadedTabs.has(tab) ? (
              <ProfileTabSkeleton tab={tab} />
            ) : tab !== 'taste-dna' && tabErrors[tab] ? (
              <Empty title={/private|hidden|follow|not allowed|forbidden/i.test(tabErrors[tab]) ? 'This section is private.' : 'Couldn’t load this.'} icon={Lock}>
                {/private|hidden|follow|not allowed|forbidden/i.test(tabErrors[tab]) ? `${name} has chosen not to show this on their profile.` : tabErrors[tab]}
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
                      This user hasn&apos;t logged any watched films to their diary.
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
                      This user hasn&apos;t published any full reviews yet.
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
                          <ReviewSocial reviewId={rev.id} authorName={name} likesCount={rev.likesCount || 0} commentsCount={rev.commentCount || 0} viewerLiked={Boolean(rev.isLiked)} />
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
                    <>
                      {/* Summary numbers only arrive when the owner shows them (or it's your own profile). */}
                      {predictions.hitRate != null && (isSelf || showSummary) && (
                        <div className="pp2-callsum sx-in">
                          <span><b>{predictions.calls.length}</b> calls</span>
                          <span><b>{predictions.hitRate}%</b> hit rate</span>
                          {predictions.brierScore != null && <span><b>{Number(predictions.brierScore).toFixed(3)}</b> Brier</span>}
                          {isSelf && !showSummary && <span className="pp2-hidden-note"><EyeOff size={13} /> Hidden from others</span>}
                        </div>
                      )}
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
                    </>
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

/** The avatar picture, or a tinted initial when there is none (or it fails to load). */
function AvatarImage({ name, src }: { name: string; src?: string | null }) {
  const [broken, setBroken] = useState<string | null>(null);
  const show = Boolean(src) && broken !== src;
  return (
    <span className="pp2-avatar-img" role="img" aria-label={`${name}’s avatar`}>
      {show ? <img src={src!} alt="" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(src!)} /> : <span aria-hidden="true">{[...name.trim()][0]?.toUpperCase() || '?'}</span>}
    </span>
  );
}

/** Five stars filled to `value` (0–5). */
function StarMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="pp2-stars" role="img" aria-label={`Average rating ${value.toFixed(1)} out of 5`}>
      <span className="pp2-stars-base" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} />)}</span>
      <span className="pp2-stars-fill" style={{ width: `${pct}%` }} aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} />)}</span>
    </span>
  );
}

/** A labelled bar that fills once it scrolls into view. */
function Meter({ value, max, label, display, tone = 'mint' }: { value: number; max: number; label: string; display: React.ReactNode; tone?: 'mint' | 'sky' | 'gold' }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const pct = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div ref={ref} className={`pp2-meter is-${tone}`}>
      <div className="pp2-meter-top"><span>{label}</span><b>{display}</b></div>
      <div className="pp2-meter-track" aria-hidden="true"><i style={{ width: seen ? `${pct}%` : 0 }} /></div>
    </div>
  );
}

function PredictionCard({ profile, isSelf, show, busy, onToggle }: {
  profile: PublicProfile;
  isSelf: boolean;
  show: boolean;
  busy: boolean;
  onToggle: (show: boolean) => void;
}) {
  const { brierScore, hitRate, totalPredictions } = profile.stats;
  const calls = totalPredictions || 0;
  // Brier: 0 is perfect, 0.25 is a coin flip, 0.5+ is worse than guessing.
  const skill = brierScore != null ? Math.max(0, Math.min(100, ((0.5 - brierScore) / 0.5) * 100)) : 0;
  return (
    <section className={`glass pp2-card is-pred sx-in ${isSelf && !show ? 'is-hidden' : ''}`} style={stagger(0, 80)} aria-labelledby="pp2-pred-h">
      <div className="pp2-card-head">
        <span className="pp2-card-icon"><Activity size={16} /></span>
        <h3 id="pp2-pred-h">Prediction accuracy</h3>
        {isSelf && (
          <button
            type="button"
            role="switch"
            aria-checked={show}
            className={`pp2-switch ${show ? 'is-on' : ''}`}
            onClick={() => onToggle(!show)}
            disabled={busy}
            aria-label="Show prediction summary on my profile"
            title="Show prediction summary on my profile"
          >
            <span className="pp2-switch-track" aria-hidden="true"><i /></span>
            <span className="pp2-switch-text">Show on profile</span>
          </button>
        )}
      </div>
      {isSelf && !show && (
        <p className="pp2-hidden-note" role="note"><EyeOff size={13} /> Hidden from others — only you can see this card.</p>
      )}
      <div className="pp2-pred-body">
        <ProgressRing value={hitRate ?? 0} size={104} stroke={10} className="pp2-pred-ring">
          <b>{hitRate != null ? <CountUp value={hitRate} decimals={hitRate % 1 ? 1 : 0} suffix="%" /> : '—'}</b>
          <small>hit rate</small>
        </ProgressRing>
        <div className="pp2-pred-side">
          <div className="pp2-pred-brier">
            <b>{brierScore != null ? <CountUp value={brierScore} decimals={3} /> : '—'}</b>
            <small>Brier score · lower is better</small>
          </div>
          <div className="pp2-brier-meter" aria-hidden="true">
            <BrierBar skill={skill} />
            <span className="pp2-brier-coin">coin flip</span>
          </div>
        </div>
      </div>
      <p className="pp2-card-foot">
        {calls > 0 ? `${calls} call${calls === 1 ? '' : 's'} on record.` : 'No calls yet — opening-weekend predictions unlock calibration stats.'}
      </p>
    </section>
  );
}

function BrierBar({ skill }: { skill: number }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  return <div ref={ref} className="pp2-brier-track"><i style={{ width: seen ? `${skill}%` : 0 }} /><span className="pp2-brier-mid" /></div>;
}

function WatchingCard({ profile }: { profile: PublicProfile }) {
  const total = profile.stats.totalFilmsWatched || 0;
  const thisYear = profile.stats.filmsWatchedThisYear || 0;
  const reviews = profile.stats.totalReviews || 0;
  return (
    <section className="glass pp2-card is-watch sx-in" style={stagger(1, 80)} aria-labelledby="pp2-watch-h">
      <div className="pp2-card-head">
        <span className="pp2-card-icon is-sky"><Film size={16} /></span>
        <h3 id="pp2-watch-h">Watching stats</h3>
      </div>
      <div className="pp2-watch-total">
        <b><CountUp value={total} /></b>
        <small>film{total === 1 ? '' : 's'} logged</small>
      </div>
      <div className="pp2-meters">
        <Meter label={`This year (${new Date().getFullYear()})`} value={thisYear} max={total} display={<CountUp value={thisYear} />} tone="sky" />
        <Meter label="Reviewed" value={reviews} max={Math.max(total, reviews)} display={<CountUp value={reviews} />} tone="gold" />
      </div>
    </section>
  );
}

/** Header-shaped placeholder while the profile itself loads (same layout as the real page). */
function ProfileHeaderSkeleton() {
  return (
    <div className="public-profile-page pp2" aria-busy="true" aria-label="Loading profile">
      <div className="pp2-stage">
        <div className="pf-banner is-empty is-skel"><span className="pf-banner-fade" aria-hidden="true" /></div>
      </div>
      <div className="profile-container pp-container pp2-container">
        <div className="pp2-head">
          <div className="pp2-avatar is-skel"><span className="ex-skel pp2-avatar-img" /></div>
          <div className="pp2-id">
            <div className="ex-skel pp-skel-line" style={{ width: 'min(260px, 70%)', height: 28 }} />
            <div className="ex-skel pp-skel-line" style={{ width: 'min(200px, 50%)' }} />
            <div className="ex-skel pp-skel-line" style={{ width: 'min(420px, 90%)' }} />
          </div>
          <div className="pp2-actions">
            <div className="ex-skel pp2-skel-btn" />
            <div className="ex-skel pp2-skel-btn is-small" />
          </div>
        </div>
        <div className="pp2-chips">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel pp2-skel-chip" />)}
        </div>
        <div className="pf-four">
          <div className="ex-skel pp-skel-line" style={{ width: 160, height: 18, marginBottom: 16 }} />
          <div className="pf-four-grid">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel pp2-skel-poster" style={{ ['--tilt' as string]: `${[-4, -1.5, 1.5, 4][i]}deg` } as CSSProperties} />)}
          </div>
        </div>
        <div className="pp2-cards">
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

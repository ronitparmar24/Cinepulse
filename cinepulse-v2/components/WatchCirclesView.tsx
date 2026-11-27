'use client';
import { useState, useEffect } from 'react';
import { Users, Plus, Trophy, Bookmark, Copy, ArrowUp, ArrowDown, Trash2, Calendar, Film } from 'lucide-react';
import type { WatchCircle, WatchCircleDetails } from '@/lib/circles';
import { api } from './client';
import { useApp } from './Context';
import { RingAvatar, nameHue, stagger } from './SocialMotion';
import './circles.css';

export function WatchCirclesView() {
  const { user, needAuth, toast, openTitle } = useApp();
  const [circles, setCircles] = useState<WatchCircle[]>([]);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [circleDetails, setCircleDetails] = useState<WatchCircleDetails | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals / forms
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [candidateTitleIdInput, setCandidateTitleIdInput] = useState('');
  const [votingRanking, setVotingRanking] = useState<string[]>([]);
  const [submittingVote, setSubmittingVote] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void loadCircles();
  }, [user]);

  async function loadCircles() {
    setLoading(true);
    try {
      const res = await api<{ circles: WatchCircle[] }>('/circles', 'GET');
      setCircles(res.circles);
      if (res.circles.length > 0 && !selectedCircleId) {
        setSelectedCircleId(res.circles[0].id);
      }
    } catch {}
    finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedCircleId) return;
    void loadCircleDetails(selectedCircleId);
  }, [selectedCircleId]);

  async function loadCircleDetails(id: string) {
    try {
      const res = await api<{ circle: WatchCircleDetails }>(`/circles/${id}`, 'GET');
      setCircleDetails(res.circle);
      if (res.circle.currentPick?.candidates) {
        setVotingRanking(res.circle.currentPick.candidates.map(c => c.id));
      }
    } catch {}
  }

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!needAuth()) return;
    try {
      const res = await api<{ circle: WatchCircle }>('/circles', 'POST', {
        name: createName,
        description: createDesc
      });
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
      toast(`Circle "${res.circle.name}" created!`);
      await loadCircles();
      setSelectedCircleId(res.circle.id);
    } catch (err: any) {
      toast(err.message || 'Failed to create circle');
    }
  }

  async function handleJoinCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!needAuth()) return;
    if (!inviteCodeInput.trim()) return;
    try {
      const res = await api<{ circle: WatchCircle }>('/circles/join', 'POST', {
        inviteCode: inviteCodeInput.trim().toUpperCase()
      });
      setInviteCodeInput('');
      toast(`Joined ${res.circle.name}!`);
      await loadCircles();
      setSelectedCircleId(res.circle.id);
    } catch (err: any) {
      toast(err.message || 'Invalid invite code');
    }
  }

  async function handleRemoveWatchlist(titleId: string) {
    if (!selectedCircleId) return;
    try {
      await api(`/circles/${selectedCircleId}/watchlist/${titleId}`, 'DELETE');
      toast('Removed from circle watchlist');
      void loadCircleDetails(selectedCircleId);
    } catch (err: any) {
      toast(err.message || 'Failed to remove');
    }
  }

  function moveRanking(idx: number, direction: 'up' | 'down') {
    const next = [...votingRanking];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setVotingRanking(next);
  }

  async function handleSubmitPickVote() {
    if (!selectedCircleId || !circleDetails?.currentPick) return;
    setSubmittingVote(true);
    try {
      await api(`/circles/${selectedCircleId}/vote`, 'POST', {
        pickId: circleDetails.currentPick.id,
        ranking: votingRanking
      });
      toast('Circle vote counted!');
      void loadCircleDetails(selectedCircleId);
    } catch (err: any) {
      toast(err.message || 'Failed to cast vote');
    } finally {
      setSubmittingVote(false);
    }
  }

  function copyInvite(code: string) {
    void navigator.clipboard.writeText(code);
    toast(`Copied invite code ${code} to clipboard!`);
  }

  const hero = (
    <header className="sxh ci-hero">
      <div className="sxh-aurora" aria-hidden="true" />
      <div className="sxh-row">
        <div>
          <span className="sxh-kicker"><Users size={13} /> Persistent film clubs</span>
          <h2 className="sxh-title">Watch <em>Circles</em></h2>
          <p className="sxh-sub">Shared watchlists, weekly group movie picks, and community reviews for your inner circle.</p>
        </div>
        {user && (
          <div className="sxh-actions">
            <button type="button" className="button primary small ci-new" onClick={() => setShowCreate((v) => !v)} aria-expanded={showCreate}>
              <Plus size={14} /> New Circle
            </button>
          </div>
        )}
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="ci-page" aria-busy="true" aria-label="Loading circles">
        {hero}
        <div className="ci-bar">
          <div className="ci-chips">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="ex-skel ci-skel-chip" />)}</div>
        </div>
        <CircleDetailsSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="ci-page">
        {hero}
        <div className="glass ci-signin sx-in">
          <span className="ci-signin-icon"><Users size={28} /></span>
          <h3>Your film club, minus the group chat chaos.</h3>
          <p className="muted">Sign in to create or join private cinema circles with your friends and film club.</p>
          <button type="button" className="button primary" onClick={() => needAuth()}>
            Sign In to Access Circles
          </button>
        </div>
      </div>
    );
  }

  const detailsReady = Boolean(circleDetails && circleDetails.id === selectedCircleId);
  const members = circleDetails?.members ?? [];

  return (
    <div className="ci-page">
      {hero}

      {/* Top Circles Selector & Join Bar */}
      <div className="ci-bar">
        <div className="ci-chips" role="group" aria-label="Your circles">
          {circles.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`ci-chip sx-in ${selectedCircleId === c.id ? 'is-on' : ''}`}
              style={stagger(i, 50)}
              onClick={() => setSelectedCircleId(c.id)}
              aria-pressed={selectedCircleId === c.id}
            >
              <span className="ci-chip-mark" aria-hidden="true" style={{ background: `hsl(${nameHue(c.name)} 40% 28%)`, color: `hsl(${nameHue(c.name)} 75% 82%)` }}>
                {c.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="ci-chip-text">
                <b>{c.name}</b>
                <small>{c.memberCount || 1} member{(c.memberCount || 1) === 1 ? '' : 's'}</small>
              </span>
            </button>
          ))}
          {circles.length === 0 && (
            <span className="ci-none">No circles yet. Create one or join with an invite code!</span>
          )}
        </div>

        <form onSubmit={handleJoinCircle} className="ci-join">
          <input
            type="text"
            placeholder="Invite code (CIRC-…)"
            aria-label="Invite code"
            value={inviteCodeInput}
            onChange={e => setInviteCodeInput(e.target.value.toUpperCase())}
          />
          <button type="submit" className="button secondary small">Join</button>
        </form>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="glass ci-card ci-create sx-in">
          <h3>Create a New Watch Circle</h3>
          <form onSubmit={handleCreateCircle} className="ci-create-form">
            <label>Circle Name
              <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. Neo-Noir Society" required />
            </label>
            <label>Description (Optional)
              <input type="text" value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="e.g. Exploring 70s-90s psychological mysteries" />
            </label>
            <div className="ci-create-actions">
              <button type="button" className="button secondary small" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="button primary small">Create Circle</button>
            </div>
          </form>
        </div>
      )}

      {circles.length === 0 && !showCreate && (
        <div className="glass ci-signin sx-in">
          <span className="ci-signin-icon"><Users size={28} /></span>
          <h3>Start your first circle.</h3>
          <p className="muted">Invite friends with a code, build a shared watchlist and vote on a film every week.</p>
          <button type="button" className="button primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Create a circle
          </button>
        </div>
      )}

      {selectedCircleId && !detailsReady && <CircleDetailsSkeleton />}

      {/* Selected Circle Body */}
      {circleDetails && detailsReady && (
        <div className="ci-body" key={circleDetails.id}>
          {/* Circle banner: name, description, member stack */}
          <div className="glass ci-card ci-summary sx-in">
            <div className="ci-summary-main">
              <span className="ci-summary-mark" aria-hidden="true" style={{ background: `hsl(${nameHue(circleDetails.name)} 40% 26%)`, color: `hsl(${nameHue(circleDetails.name)} 75% 82%)` }}>
                {circleDetails.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="ci-summary-text">
                <h3>{circleDetails.name}</h3>
                {circleDetails.description && <p>{circleDetails.description}</p>}
              </div>
            </div>
            <div className="ci-stack-wrap">
              <div className="ci-stack" aria-label={`${members.length} member${members.length === 1 ? '' : 's'}: ${members.map((m) => m.name).join(', ')}`} role="img">
                {members.slice(0, 5).map((m, i) => (
                  <span key={m.userId} className="ci-stack-item" style={{ zIndex: 10 - i, animationDelay: `${120 + i * 60}ms` }} title={m.name}>
                    <RingAvatar name={m.name} size={34} />
                  </span>
                ))}
                {members.length > 5 && <span className="ci-stack-more">+{members.length - 5}</span>}
              </div>
              <small>{members.length} member{members.length === 1 ? '' : 's'}</small>
            </div>
          </div>

          <div className="ci-grid">
            {/* Left Column: Weekly Pick & Shared Watchlist */}
            <div className="ci-col">
              {/* Weekly Movie Pick Card */}
              <div className="glass ci-card sx-in" style={stagger(1, 70)}>
                <div className="ci-card-head">
                  <div className="ci-card-title">
                    <Calendar size={16} className="mint" />
                    <h4>Weekly Movie Pick</h4>
                  </div>
                  {circleDetails.currentPick && (
                    <span className="outline-pill ci-week">WEEK OF {circleDetails.currentPick.weekOf}</span>
                  )}
                </div>

                {circleDetails.currentPick ? (
                  <div>
                    {circleDetails.currentPick.selectedTitle && (
                      <button type="button" className="ci-pick" onClick={() => openTitle(circleDetails.currentPick!.selectedTitle!.id)}>
                        {circleDetails.currentPick.selectedTitle.poster ? (
                          <img src={circleDetails.currentPick.selectedTitle.poster} alt="" />
                        ) : <span className="ci-pick-ph"><Film size={18} /></span>}
                        <span className="ci-pick-text">
                          <span className="eyebrow mint">CURRENT SELECTION</span>
                          <b>{circleDetails.currentPick.selectedTitle.title}</b>
                          <small className="muted">{circleDetails.currentPick.selectedTitle.genres.slice(0, 2).join(', ')}</small>
                        </span>
                      </button>
                    )}

                    {circleDetails.currentPick.status === 'voting' && (
                      <div>
                        <p className="muted ci-hint">Rank this week&apos;s candidates using Borda tally:</p>
                        <ol className="ci-rank">
                          {votingRanking.map((candId, idx) => {
                            const t = circleDetails.currentPick?.candidates.find(c => c.id === candId);
                            if (!t) return null;
                            return (
                              <li key={candId} className="ci-rank-row">
                                <span className="ci-rank-num">#{idx + 1}</span>
                                <span className="ci-rank-title">{t.title}</span>
                                <button type="button" disabled={idx === 0} onClick={() => moveRanking(idx, 'up')} aria-label={`Move ${t.title} up`}><ArrowUp size={13} /></button>
                                <button type="button" disabled={idx === votingRanking.length - 1} onClick={() => moveRanking(idx, 'down')} aria-label={`Move ${t.title} down`}><ArrowDown size={13} /></button>
                              </li>
                            );
                          })}
                        </ol>
                        <button type="button" className="button primary small full" onClick={handleSubmitPickVote} disabled={submittingVote}>
                          {submittingVote ? 'Counting…' : 'Cast Circle Vote'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="muted ci-empty">No active weekly pick. Add movies to the circle watchlist to nominate candidates.</p>
                )}
              </div>

              {/* Shared Watchlist */}
              <div className="glass ci-card sx-in" style={stagger(2, 70)}>
                <div className="ci-card-head">
                  <div className="ci-card-title">
                    <Bookmark size={16} className="amber" />
                    <h4>Circle Watchlist <span className="ci-count">{circleDetails.watchlist.length}</span></h4>
                  </div>
                </div>

                <ul className="ci-list">
                  {circleDetails.watchlist.map((item, i) => (
                    <li key={item.id} className="ci-item ex-in" style={stagger(i, 35)}>
                      <button type="button" className="ci-item-poster" onClick={() => openTitle(item.title.id)} aria-label={`Open ${item.title.title}`}>
                        {item.title.poster ? <img src={item.title.poster} alt="" loading="lazy" /> : <Film size={14} />}
                      </button>
                      <div className="ci-item-text">
                        <button type="button" className="ci-item-title" onClick={() => openTitle(item.title.id)}>{item.title.title}</button>
                        <small>{item.title.genres.slice(0, 2).join(', ')}</small>
                      </div>
                      <button type="button" className="ci-remove" onClick={() => handleRemoveWatchlist(item.title.id)} aria-label={`Remove ${item.title.title} from the circle watchlist`}>
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                {circleDetails.watchlist.length === 0 && (
                  <p className="muted ci-empty">The circle watchlist is empty. Open any movie in CinePulse and click &quot;Save&quot; or invite friends.</p>
                )}
              </div>
            </div>

            {/* Right Column: Members & Circle Leaderboard */}
            <div className="ci-col">
              {/* Circle Meta & Invite */}
              <div className="glass ci-card ci-invite sx-in" style={stagger(1, 70)}>
                <div className="ci-card-head">
                  <span className="eyebrow mint">INVITE MEMBERS</span>
                  <button type="button" onClick={() => copyInvite(circleDetails.inviteCode)} className="ci-copy">
                    <Copy size={12} /> Copy Code
                  </button>
                </div>
                <div className="ci-code mono">{circleDetails.inviteCode}</div>
                <p className="muted ci-hint">Share this code with friends to grant them membership to this private circle.</p>
              </div>

              {/* Circle Leaderboard */}
              <div className="glass ci-card sx-in" style={stagger(2, 70)}>
                <div className="ci-card-head">
                  <div className="ci-card-title">
                    <Trophy size={16} className="amber" />
                    <h4>Circle Members &amp; Leaderboard</h4>
                  </div>
                </div>

                <ol className="ci-board">
                  {circleDetails.leaderboard.map((m, idx) => (
                    <li key={m.userId} className={`ci-board-row ex-in ${idx === 0 ? 'is-top' : ''}`} style={stagger(idx, 40)}>
                      <span className="ci-board-rank mono">#{idx + 1}</span>
                      <RingAvatar name={m.name} size={30} />
                      <span className="ci-board-name">{m.name}</span>
                      <span className="ci-board-stat mono">
                        {m.reviewsCount} review{m.reviewsCount === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Stand-ins shaped like the circle summary and its four cards. */
function CircleDetailsSkeleton() {
  return (
    <div className="ci-body" aria-busy="true" aria-label="Loading circle">
      <div className="glass ci-card ci-summary">
        <div className="ci-summary-main">
          <div className="ex-skel ci-skel-mark" />
          <div className="ci-summary-text" style={{ flex: 1 }}>
            <div className="ex-skel ci-skel-line" style={{ width: '40%', height: 18 }} />
            <div className="ex-skel ci-skel-line" style={{ width: '65%' }} />
          </div>
        </div>
        <div className="ci-stack">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="ex-skel ci-skel-avatar" />)}</div>
      </div>
      <div className="ci-grid">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="ci-col">
            <div className="glass ci-card">
              <div className="ex-skel ci-skel-line" style={{ width: '45%', height: 16, marginBottom: 18 }} />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="ci-skel-row"><span className="ex-skel ci-skel-thumb" /><span className="ex-skel ci-skel-line" style={{ flex: 1 }} /></div>
              ))}
            </div>
            <div className="ex-skel ci-skel-card" />
          </div>
        ))}
      </div>
    </div>
  );
}

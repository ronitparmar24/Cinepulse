'use client';
import { useState, useEffect } from 'react';
import { Users, Plus, Trophy, Bookmark, Check, Copy, ArrowUp, ArrowDown, Trash2, Calendar, Film } from 'lucide-react';
import type { WatchCircle, WatchCircleDetails, CircleMember, CircleWatchlistItem } from '@/lib/circles';
import { api } from './client';
import { useApp } from './Context';
import { Loading } from './UI';

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
    loadCircles();
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
    loadCircleDetails(selectedCircleId);
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
      loadCircleDetails(selectedCircleId);
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
      loadCircleDetails(selectedCircleId);
    } catch (err: any) {
      toast(err.message || 'Failed to cast vote');
    } finally {
      setSubmittingVote(false);
    }
  }

  function copyInvite(code: string) {
    navigator.clipboard.writeText(code);
    toast(`Copied invite code ${code} to clipboard!`);
  }

  if (loading) return <Loading />;

  if (!user) {
    return (
      <div className="pad-page" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
        <Users size={36} className="mint" style={{ margin: '0 auto 16px' }} />
        <h2>Watch Circles</h2>
        <p className="muted">Sign in to create or join private cinema circles with your friends and film club.</p>
        <button type="button" className="button primary" onClick={() => needAuth()} style={{ marginTop: 16 }}>
          Sign In to Access Circles
        </button>
      </div>
    );
  }

  return (
    <div className="pad-page" style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow mint"><Users size={14} /> PERSISTENT FILM CLUBS</span>
          <h2>Watch Circles</h2>
          <p className="muted">Shared watchlists, weekly group movie picks, and community reviews for your inner circle.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="button secondary small" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Circle
          </button>
        </div>
      </div>

      {/* Top Circles Selector & Join Bar */}
      <div className="glass pad-card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: 'auto' }}>
          {circles.map(c => (
            <button
              key={c.id}
              type="button"
              className={`button small ${selectedCircleId === c.id ? 'primary' : 'secondary'}`}
              onClick={() => setSelectedCircleId(c.id)}
            >
              {c.name} ({c.memberCount || 1})
            </button>
          ))}
          {circles.length === 0 && (
            <span className="muted text-xs">No circles yet. Create one or join with an invite code!</span>
          )}
        </div>

        <form onSubmit={handleJoinCircle} style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Invite Code (CIRC-...)"
            value={inviteCodeInput}
            onChange={e => setInviteCodeInput(e.target.value.toUpperCase())}
            style={{ padding: '6px 10px', fontSize: 12, textTransform: 'uppercase', width: 140 }}
          />
          <button type="submit" className="button secondary small">Join</button>
        </form>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="glass pad-card" style={{ marginBottom: 24, border: '1px solid rgba(0, 245, 155, 0.4)' }}>
          <h3>Create a New Watch Circle</h3>
          <form onSubmit={handleCreateCircle} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <label>Circle Name
              <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="e.g. Neo-Noir Society" required />
            </label>
            <label>Description (Optional)
              <input type="text" value={createDesc} onChange={e => setCreateDesc(e.target.value)} placeholder="e.g. Exploring 70s-90s psychological mysteries" />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary small" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="button primary small">Create Circle</button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Circle Body */}
      {circleDetails && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
          {/* Left Column: Weekly Pick & Shared Watchlist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Weekly Movie Pick Card */}
            <div className="glass pad-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={16} className="mint" />
                  <h4>Weekly Movie Pick</h4>
                </div>
                {circleDetails.currentPick && (
                  <span className="outline-pill">WEEK OF {circleDetails.currentPick.weekOf}</span>
                )}
              </div>

              {circleDetails.currentPick ? (
                <div>
                  {circleDetails.currentPick.selectedTitle && (
                    <div style={{ display: 'flex', gap: 14, marginBottom: 16, background: 'rgba(0,245,155,0.05)', padding: 12, borderRadius: 8 }}>
                      {circleDetails.currentPick.selectedTitle.poster && (
                        <img src={circleDetails.currentPick.selectedTitle.poster} alt="" style={{ width: 60, height: 90, objectFit: 'cover', borderRadius: 4 }} />
                      )}
                      <div>
                        <span className="eyebrow mint">CURRENT SELECTION</span>
                        <h4 style={{ margin: '2px 0 4px' }}>{circleDetails.currentPick.selectedTitle.title}</h4>
                        <small className="muted">{circleDetails.currentPick.selectedTitle.genres.slice(0, 2).join(', ')}</small>
                      </div>
                    </div>
                  )}

                  {circleDetails.currentPick.status === 'voting' && (
                    <div>
                      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                        Rank this week's candidates using Borda tally:
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                        {votingRanking.map((candId, idx) => {
                          const t = circleDetails.currentPick?.candidates.find(c => c.id === candId);
                          if (!t) return null;
                          return (
                            <div key={candId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}>
                              <span className="mono text-xs" style={{ width: 20 }}>#{idx + 1}</span>
                              <span style={{ flex: 1, fontSize: 13 }}>{t.title}</span>
                              <button type="button" disabled={idx === 0} onClick={() => moveRanking(idx, 'up')} style={{ padding: 4, background: 'none', border: 'none', color: '#8d989f', cursor: 'pointer' }}><ArrowUp size={12} /></button>
                              <button type="button" disabled={idx === votingRanking.length - 1} onClick={() => moveRanking(idx, 'down')} style={{ padding: 4, background: 'none', border: 'none', color: '#8d989f', cursor: 'pointer' }}><ArrowDown size={12} /></button>
                            </div>
                          );
                        })}
                      </div>
                      <button type="button" className="button primary small full" onClick={handleSubmitPickVote} disabled={submittingVote}>
                        Cast Circle Vote
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted text-xs">No active weekly pick. Add movies to the circle watchlist to nominate candidates.</p>
              )}
            </div>

            {/* Shared Watchlist */}
            <div className="glass pad-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Bookmark size={16} className="amber" />
                  <h4>Circle Watchlist ({circleDetails.watchlist.length})</h4>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {circleDetails.watchlist.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                    {item.title.poster && (
                      <img src={item.title.poster} alt="" style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: 4 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: 13, cursor: 'pointer' }} onClick={() => openTitle(item.title.id)}>{item.title.title}</strong>
                      <div style={{ fontSize: 11, color: '#8d989f' }}>{item.title.genres.slice(0, 2).join(', ')}</div>
                    </div>
                    <button type="button" onClick={() => handleRemoveWatchlist(item.title.id)} style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {circleDetails.watchlist.length === 0 && (
                  <p className="muted text-xs">The circle watchlist is empty. Open any movie in CinePulse and click "Save" or invite friends.</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Members & Circle Leaderboard */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Circle Meta & Invite */}
            <div className="glass pad-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow mint">INVITE MEMBERS</span>
                <button type="button" onClick={() => copyInvite(circleDetails.inviteCode)} className="text-link" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Copy size={12} /> Copy Code
                </button>
              </div>
              <div className="mono" style={{ fontSize: 18, letterSpacing: 2, fontWeight: 700, margin: '6px 0 10px', color: 'var(--neon-mint)' }}>
                {circleDetails.inviteCode}
              </div>
              <p className="muted text-xs" style={{ margin: 0 }}>
                Share this code with friends to grant them membership to this private circle.
              </p>
            </div>

            {/* Circle Leaderboard */}
            <div className="glass pad-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Trophy size={16} className="amber" />
                <h4>Circle Members & Leaderboard</h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {circleDetails.leaderboard.map((m, idx) => (
                  <div key={m.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="mono" style={{ width: 20, color: idx === 0 ? 'var(--neon-mint)' : '#8d989f', fontWeight: 700 }}>
                        #{idx + 1}
                      </span>
                      <span>{m.name}</span>
                    </div>
                    <span className="mono text-xs text-muted">
                      {m.reviewsCount} review{m.reviewsCount === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

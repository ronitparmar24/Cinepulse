'use client';
import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Users, Trophy, Clock, Check, ArrowUp, ArrowDown, Copy, Plus, Tv, RefreshCw, Film } from 'lucide-react';
import type { MovieNightSession, Participant } from '@/lib/movieNight';
import type { Title } from '@/lib/types';
import { api, money } from './client';
import { useApp } from './Context';
import { Loading } from './UI';

export function MovieNightView() {
  const { user, toast, openTitle } = useApp();
  const [session, setSession] = useState<MovieNightSession | null>(null);
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [myRanking, setMyRanking] = useState<string[]>([]);
  const [myApprovals, setMyApprovals] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New session form state
  const [newTitle, setNewTitle] = useState('Friday Movie Night');
  const [votingMethod, setVotingMethod] = useState<'borda' | 'approval'>('borda');
  const [maxRuntime, setMaxRuntime] = useState<number>(135);
  const [selectedGenre, setSelectedGenre] = useState<string>('');

  // 5-second polling when an active session is loaded
  useEffect(() => {
    if (!session?.sessionCode) return;
    const interval = setInterval(async () => {
      try {
        const res = await api<{ session: MovieNightSession }>(`/movie-night/session/${session.sessionCode}`, 'GET');
        setSession(res.session);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [session?.sessionCode]);

  // Initial candidate ordering for voter
  useEffect(() => {
    if (session?.candidates && myRanking.length === 0) {
      setMyRanking(session.candidates.map(c => c.id));
    }
  }, [session?.candidates, myRanking.length]);

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api<{ session: MovieNightSession }>('/movie-night/session', 'POST', {
        title: newTitle,
        method: votingMethod,
        maxRuntime: Number(maxRuntime) || undefined,
        genres: selectedGenre ? [selectedGenre] : []
      });
      setSession(res.session);
      if (res.session.participants[0]) {
        setParticipantId(res.session.participants[0].id);
      }
      setMyRanking(res.session.candidates.map(c => c.id));
      toast('Movie night session created! Share the 6-character code with friends.');
    } catch (err: any) {
      toast(err.message || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinSession(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionCodeInput.trim()) return;
    setLoading(true);
    try {
      const res = await api<{ session: MovieNightSession; participantId: string }>(
        `/movie-night/session/${sessionCodeInput.trim().toUpperCase()}/join`,
        'POST',
        { participantName: user?.name || 'Guest' }
      );
      setSession(res.session);
      setParticipantId(res.participantId);
      setMyRanking(res.session.candidates.map(c => c.id));
      toast(`Joined ${res.session.title}!`);
    } catch (err: any) {
      toast(err.message || 'Could not find or join session');
    } finally {
      setLoading(false);
    }
  }

  function moveRanking(index: number, direction: 'up' | 'down') {
    const next = [...myRanking];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setMyRanking(next);
  }

  function toggleApproval(candidateId: string) {
    const next = new Set(myApprovals);
    if (next.has(candidateId)) next.delete(candidateId);
    else next.add(candidateId);
    setMyApprovals(next);
  }

  async function handleSubmitVote() {
    if (!session || !participantId) return;
    setSubmitting(true);
    try {
      const res = await api<{ session: MovieNightSession }>(
        `/movie-night/session/${session.sessionCode}/vote`,
        'POST',
        {
          voterId: participantId,
          ranking: session.method === 'borda' ? myRanking : undefined,
          approvals: session.method === 'approval' ? Array.from(myApprovals) : undefined
        }
      );
      setSession(res.session);
      toast('Your ballot has been counted in the group tally!');
    } catch (err: any) {
      toast(err.message || 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinalize() {
    if (!session) return;
    setSubmitting(true);
    try {
      const res = await api<{ session: MovieNightSession }>(
        `/movie-night/session/${session.sessionCode}/finalize`,
        'POST'
      );
      setSession(res.session);
      toast('Movie night finalized! The winner has been determined.');
    } catch (err: any) {
      toast(err.message || 'Failed to finalize');
    } finally {
      setSubmitting(false);
    }
  }

  function copyCode() {
    if (!session?.sessionCode) return;
    navigator.clipboard.writeText(session.sessionCode);
    toast(`Copied session code ${session.sessionCode} to clipboard!`);
  }

  if (loading) return <Loading />;

  // ── No Active Session: Landing & Setup ─────────────────────────────────────
  if (!session) {
    return (
      <div className="pad-page" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow mint"><Sparkles size={14} /> GROUP DECISION ENGINE</span>
            <h2>Movie Night Generator</h2>
            <p className="muted">
              End group decision paralysis. Set constraints, generate curated candidates, vote using Borda count, and let math pick tonight's film.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginTop: 24 }}>
          {/* Create Session Card */}
          <div className="glass pad-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={18} className="mint" />
              <h3>Start a New Session</h3>
            </div>
            <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label>Night Name
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Sci-Fi Friday"
                  required
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>Voting Style
                  <select
                    value={votingMethod}
                    onChange={e => setVotingMethod(e.target.value as any)}
                  >
                    <option value="borda">Borda Count (Ranked)</option>
                    <option value="approval">Approval (Checkboxes)</option>
                  </select>
                </label>
                <label>Max Runtime
                  <select
                    value={maxRuntime}
                    onChange={e => setMaxRuntime(Number(e.target.value))}
                  >
                    <option value={105}>Under 1h 45m</option>
                    <option value={125}>Under 2h 05m</option>
                    <option value={150}>Under 2h 30m</option>
                    <option value={999}>Any length</option>
                  </select>
                </label>
              </div>

              <label>Genre Focus (Optional)
                <select
                  value={selectedGenre}
                  onChange={e => setSelectedGenre(e.target.value)}
                >
                  <option value="">All Genres / Mixed</option>
                  <option value="Sci-Fi">Sci-Fi</option>
                  <option value="Thriller">Thriller</option>
                  <option value="Action">Action</option>
                  <option value="Comedy">Comedy</option>
                  <option value="Drama">Drama</option>
                  <option value="Horror">Horror</option>
                </select>
              </label>

              <button type="submit" className="button primary full" style={{ marginTop: 8 }}>
                Generate Night Candidates
              </button>
            </form>
          </div>

          {/* Join Session Card */}
          <div className="glass pad-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} className="amber" />
              <h3>Join with Code</h3>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Enter the 6-character room code from your host to submit your ballot and watch the live group tally update in real-time.
            </p>
            <form onSubmit={handleJoinSession} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 'auto' }}>
              <label>Session Code
                <input
                  type="text"
                  value={sessionCodeInput}
                  onChange={e => setSessionCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. 7KB9X2"
                  maxLength={6}
                  style={{ textTransform: 'uppercase', letterSpacing: 3, fontWeight: 700, fontSize: 18 }}
                  required
                />
              </label>
              <button type="submit" className="button secondary full">
                Join Session
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Active Session View ───────────────────────────────────────────────────
  const hasVoted = session.votes.some(v => v.voterId === participantId);
  const isHost = session.hostUserId && user?.id ? session.hostUserId === user.id : true;
  const isCompleted = session.status === 'completed';

  return (
    <div className="pad-page" style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Session Top Bar */}
      <div className="glass pad-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="eyebrow mint">{session.method.toUpperCase()} VOTING</span>
            {isCompleted && <span className="outline-pill">COMPLETED</span>}
          </div>
          <h2 style={{ margin: '4px 0 0' }}>{session.title}</h2>
          <small className="muted">Host: {session.hostName} · 24h ephemeral room</small>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="glass" style={{ padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#8d989f' }}>CODE:</span>
            <strong className="mono" style={{ fontSize: 16, letterSpacing: 2 }}>{session.sessionCode}</strong>
            <button type="button" onClick={copyCode} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--neon-mint)' }}>
              <Copy size={14} />
            </button>
          </div>

          {isHost && !isCompleted && (
            <button type="button" className="button primary small" onClick={handleFinalize} disabled={submitting}>
              Finalize & Pick Winner
            </button>
          )}
        </div>
      </div>

      {/* Winner Spotlight (if finalized) */}
      {session.winnerTitle && (
        <div className="glass pad-card" style={{ border: '1px solid rgba(0, 245, 155, 0.4)', background: 'rgba(0, 245, 155, 0.04)', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--neon-mint)', marginBottom: 12 }}>
            <Trophy size={20} />
            <strong style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Tonight's Winning Selection</strong>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {session.winnerTitle.poster && (
              <img
                src={session.winnerTitle.poster}
                alt={session.winnerTitle.title}
                style={{ width: 120, height: 180, objectFit: 'cover', borderRadius: 8 }}
              />
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3>{session.winnerTitle.title}</h3>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#8d989f' }}>
                {session.winnerTitle.runtime && <span><Clock size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> {Math.floor(session.winnerTitle.runtime/60)}h {session.winnerTitle.runtime%60}m</span>}
                <span>{session.winnerTitle.genres.slice(0, 2).join(' · ')}</span>
                {session.winnerTitle.voteAverage && <span>★ {session.winnerTitle.voteAverage.toFixed(1)} TMDB</span>}
              </div>
              <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>
                {session.winnerTitle.overview || session.winnerTitle.tagline || 'Ready to watch.'}
              </p>
              <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                <button type="button" className="button primary small" onClick={() => openTitle(session.winnerTitle!.id)}>
                  View Full Details & Streaming Options
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Participants Strip */}
      <div className="glass pad-card" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} className="amber" />
            <h4>Participants ({session.participants.length})</h4>
          </div>
          <span className="mono text-xs text-muted">
            {session.votes.length} of {session.participants.length} votes cast
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {session.participants.map(p => (
            <div key={p.id} className="glass" style={{ padding: '6px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span>{p.name}</span>
              {p.voted ? <Check size={13} className="mint" /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8d989f' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Ballot Submission Area (if voting still open) */}
      {!isCompleted && (
        <div className="glass pad-card" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <span className="eyebrow mint">YOUR BALLOT</span>
              <h3>
                {session.method === 'borda'
                  ? 'Rank your choices from best to worst'
                  : 'Select all movies you are happy to watch'}
              </h3>
            </div>
            <button
              type="button"
              className="button primary small"
              onClick={handleSubmitVote}
              disabled={submitting}
            >
              {hasVoted ? 'Update My Ballot' : 'Submit Ballot'}
            </button>
          </div>

          {session.method === 'borda' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myRanking.map((candId, idx) => {
                const title = session.candidates.find(c => c.id === candId);
                if (!title) return null;
                return (
                  <div
                    key={candId}
                    className="glass"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: idx === 0 ? '1px solid rgba(0, 245, 155, 0.4)' : undefined
                    }}
                  >
                    <span className="mono" style={{ fontSize: 14, fontWeight: 800, width: 24, color: idx === 0 ? 'var(--neon-mint)' : '#8d989f' }}>
                      #{idx + 1}
                    </span>
                    {title.poster && (
                      <img src={title.poster} alt="" style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <strong>{title.title}</strong>
                      <div style={{ fontSize: 11, color: '#8d989f' }}>
                        {title.genres.slice(0, 2).join(', ')} {title.runtime ? `· ${title.runtime}m` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveRanking(idx, 'up')}
                        style={{ padding: 6, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === myRanking.length - 1}
                        onClick={() => moveRanking(idx, 'down')}
                        style={{ padding: 6, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {session.candidates.map(cand => {
                const approved = myApprovals.has(cand.id);
                return (
                  <button
                    type="button"
                    key={cand.id}
                    onClick={() => toggleApproval(cand.id)}
                    className={`glass ${approved ? 'is-saved' : ''}`}
                    style={{
                      padding: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderRadius: 8,
                      border: approved ? '1px solid var(--neon-mint)' : '1px solid rgba(255,255,255,0.1)',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    {cand.poster && (
                      <img src={cand.poster} alt="" style={{ width: 40, height: 58, objectFit: 'cover', borderRadius: 4 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <strong>{cand.title}</strong>
                      <div style={{ fontSize: 11, color: '#8d989f' }}>{cand.genres[0]}</div>
                    </div>
                    {approved && <Check size={16} className="mint" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Live Tally Breakdown */}
      {session.tally && session.tally.scores.length > 0 && (
        <div className="glass pad-card">
          <div className="section-heading compact">
            <div>
              <span className="eyebrow amber">MATHEMATICAL RESOLUTION</span>
              <h4>{session.method === 'borda' ? 'Borda Point Scores' : 'Approval Counts'}</h4>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {session.tally.scores.map(s => {
              const t = session.candidates.find(c => c.id === s.candidateId);
              if (!t) return null;
              return (
                <div key={s.candidateId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="mono" style={{ width: 24, fontWeight: 700, color: s.rank === 1 ? 'var(--neon-mint)' : '#8d989f' }}>
                      #{s.rank}
                    </span>
                    <span>{t.title}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: s.rank === 1 ? 'var(--neon-mint)' : '#cbd5e1' }}>
                    {session.method === 'borda'
                      ? `${s.score} pts (${s.firstPlaceVotes} firsts)`
                      : `${s.score} approvals`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

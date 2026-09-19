'use client';
import { useState, useEffect } from 'react';
import { Trophy, Brain, Users, TrendingUp, Award, Zap, CheckCircle2, ChevronRight, BarChart2 } from 'lucide-react';
import type { LeaderboardEntry, YouVsEngineStats, CrowdVsEngineStats } from '@/lib/pulse/adjudication';
import { api } from './client';
import { useApp } from './Context';
import { Loading } from './UI';

export function LeaderboardView() {
  const { user } = useApp();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [youVsEngine, setYouVsEngine] = useState<YouVsEngineStats | null>(null);
  const [crowdVsEngine, setCrowdVsEngine] = useState<CrowdVsEngineStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{
      leaderboard: LeaderboardEntry[];
      youVsEngine: YouVsEngineStats;
      crowdVsEngine: CrowdVsEngineStats;
    }>('/leaderboard')
      .then((res) => {
        setLeaderboard(res.leaderboard);
        setYouVsEngine(res.youVsEngine);
        setCrowdVsEngine(res.crowdVsEngine);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) return <Loading />;

  return (
    <div className="leaderboard-container">
      {/* Hero Header */}
      <div className="leaderboard-hero">
        <div className="leaderboard-badge">
          <Trophy size={14} className="gold" /> BRIER ACCURACY LEADERBOARD
        </div>
        <h1>The Forecasters Board.</h1>
        <p className="muted">
          Scored strictly using the quadratic <strong>Brier Score</strong>: (Forecast − Outcome)².
          A perfect score is 0.000. Random guessing is 0.250. Can you beat the CinePulse AI Engine?
        </p>
      </div>

      {/* Top Cards: You vs Engine & Wisdom of the Crowd */}
      <div className="leaderboard-top-grid">
        {/* You vs Engine Card */}
        <div className="you-vs-engine-card glass">
          <div className="card-eyebrow">
            <Zap size={16} className="mint" /> YOU VS THE ENGINE
          </div>
          <div className="yve-content">
            <div className="yve-side">
              <span className="yve-label">{user ? user.name : 'Your Profile'}</span>
              <div className="yve-score">
                {youVsEngine?.userBrier !== null ? youVsEngine?.userBrier.toFixed(3) : '—'}
              </div>
              <small className="muted">
                {youVsEngine?.userTotalCalls ? `${youVsEngine.userAccuracy}% acc (${youVsEngine.userTotalCalls} calls)` : 'Make your first call'}
              </small>
            </div>

            <div className="yve-vs">VS</div>

            <div className="yve-side engine">
              <span className="yve-label"><Brain size={14} /> CinePulse Engine</span>
              <div className="yve-score mint">{youVsEngine?.engineBrier.toFixed(3)}</div>
              <small className="muted">{youVsEngine?.engineAccuracy}% acc ({youVsEngine?.engineTotalCalls} calls)</small>
            </div>
          </div>

          <div className="yve-verdict-banner">
            {youVsEngine?.verdict === 'leading' ? (
              <span className="lead-win"><Trophy size={14} /> You are outperforming the model!</span>
            ) : youVsEngine?.verdict === 'trailing' ? (
              <span className="lead-loss"><Brain size={14} /> The model currently has the edge</span>
            ) : (
              <span className="lead-neu">Submit 3+ opening calls on upcoming films to rank</span>
            )}
          </div>
        </div>

        {/* Crowd vs Engine Card */}
        <div className="crowd-vs-engine-card glass">
          <div className="card-eyebrow">
            <Users size={16} className="mint" /> WISDOM OF THE CROWD VS MODEL
          </div>
          <p className="card-desc muted">
            Tracking collective consensus against the algorithmic predictor over {crowdVsEngine?.totalTitlesTracked} upcoming releases.
          </p>
          <div className="crowd-stat-row">
            <div className="crowd-stat">
              <span className="crowd-num">{crowdVsEngine?.crowdHitPct}%</span>
              <span className="crowd-lbl">Crowd Hit Calls</span>
            </div>
            <div className="crowd-divider" />
            <div className="crowd-stat">
              <span className="crowd-num mint">{crowdVsEngine?.engineHitPct}%</span>
              <span className="crowd-lbl">Model Hit Outlook</span>
            </div>
            <div className="crowd-divider" />
            <div className="crowd-stat">
              <span className="crowd-num">{crowdVsEngine?.agreementRate}%</span>
              <span className="crowd-lbl">Consensus Agreement</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Leaderboard Table */}
      <section className="leaderboard-table-card glass">
        <div className="table-header-wrap">
          <div className="table-title">
            <Award size={20} className="gold" />
            <h2>Universal Accuracy Standings</h2>
          </div>
          <span className="scoring-pill">Lower Brier = Superior Calibration</span>
        </div>

        <div className="table-responsive">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Participant</th>
                <th>Brier Score</th>
                <th>Hit Accuracy</th>
                <th>Total Calls</th>
                <th>Correct</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry) => {
                const isEngine = entry.entityType === 'engine';
                const isMe = user && entry.entityId === user.id;

                return (
                  <tr
                    key={entry.entityId}
                    className={`${isEngine ? 'engine-row' : ''} ${isMe ? 'me-row' : ''}`}
                  >
                    <td>
                      <span className={`rank-num ${entry.rank <= 3 ? `rank-${entry.rank}` : ''}`}>
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                      </span>
                    </td>
                    <td>
                      <div className="participant-cell">
                        <span className="participant-avatar">
                          {entry.avatarUrl || (isEngine ? '🧠' : '👤')}
                        </span>
                        <div>
                          <strong>{entry.entityName}</strong>
                          {isEngine && <span className="engine-tag">OFFICIAL ENGINE</span>}
                          {isMe && <span className="me-tag">YOU</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="brier-highlight">
                        {entry.brierScore.toFixed(3)}
                      </span>
                    </td>
                    <td>
                      <div className="acc-bar-wrap">
                        <div className="acc-bar" style={{ width: `${entry.accuracyRate}%` }} />
                        <span>{entry.accuracyRate}%</span>
                      </div>
                    </td>
                    <td className="muted">{entry.totalCalls}</td>
                    <td><strong>{entry.correctCalls}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

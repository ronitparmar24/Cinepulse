'use client';
import { useState, useEffect, useRef } from 'react';
import { Trophy, Brain, Users, Award, Zap, Clock, RotateCcw, Bot } from 'lucide-react';
import type { LeaderboardEntry, YouVsEngineStats, CrowdVsEngineStats } from '@/lib/pulse/adjudication';
import { api } from './client';
import { useApp } from './Context';
import { getCachedLeaderboard, setCachedLeaderboard, formatCacheAge } from './catalogCache';
import { AiBadge } from './AiBadge';
import { CountUp, GrowBar, PkHero, PkTabs, stagger, useReveal } from './PredictKit';

type BoardTab = 'humans' | 'crew';

function Avatar({ entry }: { entry: LeaderboardEntry }) {
  const isEngine = entry.entityType === 'engine';
  // Seeded and AI accounts store an image URL; the engine stores an emoji.
  return entry.avatarUrl && /^https?:\/\//.test(entry.avatarUrl)
    ? <img src={entry.avatarUrl} alt="" loading="lazy" />
    : <>{entry.avatarUrl || (isEngine ? '🧠' : '👤')}</>;
}

/** Top-3 podium (2 · 1 · 3), columns rising in. Empty seats render as dashed placeholders. */
function Podium({ entries, meId }: { entries: LeaderboardEntry[]; meId?: string }) {
  const byPlace = [2, 1, 3].map((place) => ({ place, entry: entries.find((e) => e.rank === place) ?? entries[place - 1] }));
  return (
    <div className="pk-podium" aria-label="Top three forecasters">
      {byPlace.map(({ place, entry }) => entry ? (
        <div key={place} className={`pk-pod p${place} ${entry.entityId === meId ? 'is-me' : ''}`}>
          <span className="pk-pod-avatar"><Avatar entry={entry} /><span className="pk-pod-medal" aria-hidden="true">{place}</span></span>
          <span className="pk-pod-name" title={entry.entityName}>{entry.entityName}{entry.entityId === meId && <span className="me-tag">YOU</span>}</span>
          <div className="pk-pod-block">
            <CountUp value={entry.brierScore} decimals={3} />
            <small>Brier · {entry.accuracyRate}% acc</small>
            <span className="pk-pod-rank" aria-hidden="true">{place}</span>
          </div>
        </div>
      ) : (
        <div key={place} className={`pk-pod p${place} is-empty`}>
          <span className="pk-pod-avatar">?</span>
          <span className="pk-pod-name muted">Open seat</span>
          <div className="pk-pod-block"><small>Make 3+ calls</small><span className="pk-pod-rank" aria-hidden="true">{place}</span></div>
        </div>
      ))}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="leaderboard-container" aria-busy="true" aria-label="Loading leaderboard">
      <div className="ex-skel" style={{ height: 190, borderRadius: 26, marginBottom: 22 }} />
      <div className="pk-skel-podium">
        {[116, 150, 92].map((h, i) => <div key={i}><div className="ex-skel pk-skel-avatar" /><div className="ex-skel pk-skel-line w60" style={{ width: 80 }} /><div className="ex-skel pk-skel-block" style={{ height: h }} /></div>)}
      </div>
      <div className="pk-skel-table">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="ex-skel pk-skel-tr" style={stagger(i)} />)}</div>
    </div>
  );
}

export function LeaderboardView() {
  const { user } = useApp();
  const [boardTab, setBoardTab] = useState<BoardTab>('humans');
  const cached = getCachedLeaderboard();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(cached ? cached.data.leaderboard : []);
  const [youVsEngine, setYouVsEngine] = useState<YouVsEngineStats | null>(cached ? cached.data.youVsEngine : null);
  const [crowdVsEngine, setCrowdVsEngine] = useState<CrowdVsEngineStats | null>(cached ? cached.data.crowdVsEngine : null);
  const [loading, setLoading] = useState(!cached);
  const [cacheMeta, setCacheMeta] = useState<{cachedAt:number;fromCache:boolean}|null>(
    cached ? {cachedAt: cached.cachedAt, fromCache: true} : null
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (boardTab === 'humans' && cached && !cached.isExpired && nonce === 0) {
      return;
    }
    setLoading(true);
    const endpoint = boardTab === 'crew' ? '/leaderboard?crew=1' : '/leaderboard';
    api<{
      leaderboard: LeaderboardEntry[];
      youVsEngine: YouVsEngineStats;
      crowdVsEngine: CrowdVsEngineStats;
    }>(endpoint)
      .then((res) => {
        setLeaderboard(res.leaderboard);
        setYouVsEngine(res.youVsEngine);
        setCrowdVsEngine(res.crowdVsEngine);
        if (boardTab === 'humans') {
          setCachedLeaderboard(res);
          setCacheMeta({cachedAt: Date.now(), fromCache: false});
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id, nonce, boardTab]);

  const revealRef = useReveal<HTMLDivElement>(`${boardTab}:${leaderboard.length}:${loading}`);

  // "Your rank" dock: shown while the signed-in member's row is scrolled out of view.
  const meRowRef = useRef<HTMLTableRowElement>(null);
  const [meVisible, setMeVisible] = useState(true);
  const me = user ? leaderboard.find((e) => e.entityId === user.id) : undefined;
  useEffect(() => {
    const row = meRowRef.current;
    if (!row || typeof IntersectionObserver === 'undefined') { setMeVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setMeVisible(e.isIntersecting), { threshold: 0.6 });
    io.observe(row);
    return () => io.disconnect();
  }, [me?.entityId, boardTab, leaderboard.length]);

  if (loading && !cached) return <LeaderboardSkeleton />;

  return (
    <div className="leaderboard-container" ref={revealRef}>
      <PkHero
        icon={Trophy}
        kicker="Brier accuracy leaderboard"
        title={<>The Forecasters <em>Board.</em></>}
        aside={cacheMeta && (
          <span className="catalog-sync-indicator" title="Leaderboard cached for 1 hour to protect database & API quota.">
            <Clock size={10} style={{verticalAlign:'middle'}}/>
            {cacheMeta.fromCache ? `Cached (${formatCacheAge(cacheMeta.cachedAt).ageText})` : 'Synced'} · Refresh in {formatCacheAge(cacheMeta.cachedAt).remainingMinutes}m
            <button
              className="catalog-sync-btn"
              onClick={() => setNonce(n => n + 1)}
              title="Refresh leaderboard now"
              aria-label="Refresh leaderboard now"
            >
              <RotateCcw size={10}/>
            </button>
          </span>
        )}
        sub={<>Scored strictly using the quadratic <strong>Brier Score</strong>: (Forecast − Outcome)². A perfect score is 0.000. Random guessing is 0.250. Can you beat the CinePulse AI Engine?</>}
      />

      {/* Top Cards: You vs Engine & Wisdom of the Crowd */}
      <div className="leaderboard-top-grid pk-yve">
        <div className="you-vs-engine-card glass ex-in">
          <div className="card-eyebrow">
            <Zap size={16} className="mint" /> YOU VS THE ENGINE
          </div>
          <div className="yve-content">
            <div className="yve-side">
              <span className="yve-label">{user ? user.name : 'Your Profile'}</span>
              <div className="yve-score">
                {youVsEngine && youVsEngine.userBrier !== null ? <CountUp value={youVsEngine.userBrier} decimals={3} /> : '—'}
              </div>
              <small className="muted">
                {youVsEngine?.userTotalCalls ? `${youVsEngine.userAccuracy}% acc (${youVsEngine.userTotalCalls} calls)` : 'Make your first call'}
              </small>
            </div>

            <div className="yve-vs">VS</div>

            <div className="yve-side engine">
              <span className="yve-label"><Brain size={14} /> CinePulse Engine</span>
              <div className="yve-score mint">{youVsEngine ? <CountUp value={youVsEngine.engineBrier} decimals={3} /> : '—'}</div>
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

        <div className="crowd-vs-engine-card glass ex-in" style={stagger(1, 80)}>
          <div className="card-eyebrow">
            <Users size={16} className="mint" /> WISDOM OF THE CROWD VS MODEL
          </div>
          <p className="card-desc muted">
            Tracking collective consensus against the algorithmic predictor over {crowdVsEngine?.totalTitlesTracked} upcoming releases.
          </p>
          <div className="crowd-stat-row">
            <div className="crowd-stat">
              <span className="crowd-num">{crowdVsEngine ? <CountUp value={crowdVsEngine.crowdHitPct} suffix="%" /> : '—'}</span>
              <span className="crowd-lbl">Crowd Hit Calls</span>
            </div>
            <div className="crowd-divider" />
            <div className="crowd-stat">
              <span className="crowd-num mint">{crowdVsEngine ? <CountUp value={crowdVsEngine.engineHitPct} suffix="%" /> : '—'}</span>
              <span className="crowd-lbl">Model Hit Outlook</span>
            </div>
            <div className="crowd-divider" />
            <div className="crowd-stat">
              <span className="crowd-num">{crowdVsEngine ? <CountUp value={crowdVsEngine.agreementRate} suffix="%" /> : '—'}</span>
              <span className="crowd-lbl">Consensus Agreement</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Leaderboard */}
      <section className="leaderboard-table-card glass">
        <div className="pk-toolbar">
          <PkTabs<BoardTab>
            label="Leaderboard"
            value={boardTab}
            onChange={setBoardTab}
            tabs={[{ id: 'humans', label: 'Human Forecasters', icon: Users }, { id: 'crew', label: 'AI Pulse Crew', icon: Bot }]}
          />
          <span className="scoring-pill">Lower Brier = Superior Calibration</span>
        </div>

        <div className="table-header-wrap">
          <div className="table-title">
            <Award size={20} className="gold" />
            <h2>{boardTab === 'crew' ? 'AI Pulse Crew Standings' : 'Universal Accuracy Standings'}</h2>
          </div>
          <p className="muted" style={{ fontSize: '12px', margin: 0 }}>
            {boardTab === 'crew'
              ? 'AI critic personas compete on their own leaderboard. Opinions are simulated; excluded from human totals.'
              : 'Real human cinephile forecasters ranked by quadratic accuracy.'}
          </p>
        </div>

        {leaderboard.length > 0 && <Podium key={boardTab} entries={leaderboard} meId={user?.id} />}

        <div className="table-responsive" aria-busy={loading || undefined}>
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
            <tbody key={boardTab}>
              {leaderboard.map((entry, i) => {
                const isEngine = entry.entityType === 'engine';
                const isMe = !!user && entry.entityId === user.id;

                return (
                  <tr
                    key={entry.entityId}
                    ref={isMe ? meRowRef : undefined}
                    className={`ex-in ${isEngine ? 'engine-row' : ''} ${isMe ? 'me-row' : ''}`}
                    style={stagger(i)}
                  >
                    <td>
                      {entry.rank <= 3
                        ? <span className={`pk-medal m${entry.rank}`} aria-label={`Rank ${entry.rank}`}>{entry.rank}</span>
                        : <span className="rank-num">#{entry.rank}</span>}
                    </td>
                    <td>
                      <div className="participant-cell">
                        <span className="participant-avatar"><Avatar entry={entry} /></span>
                        <div>
                          <strong>{entry.entityName}</strong>
                          {entry.isAi && <AiBadge />}
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
                        <GrowBar value={entry.accuracyRate} delay={Math.min(i, 12) * 40 + 150} />
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

        {me && (
          <div className={`pk-me-dock ${meVisible ? 'is-hidden' : ''}`} aria-hidden={meVisible}>
            <span>Your rank</span><b>#{me.rank}</b><span>Brier {me.brierScore.toFixed(3)} · {me.accuracyRate}% acc</span>
          </div>
        )}
      </section>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { Bot, Play, Pause, AlertTriangle, CheckCircle, RefreshCw, ArrowLeft, Shield } from 'lucide-react';
import { AiBadge } from '@/components/AiBadge';
import { api } from '@/components/client';

export default function AdminAiCommunityPage() {
  const [data, setData] = useState<{
    enabled: boolean;
    queue: { ready: number; published: number; rejected: number };
    recentActions: Array<{
      id: number;
      persona_id: string;
      action: string;
      target_id: string;
      provider: string;
      reason_code: string;
      created_at: string;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const res = await api<any>('/admin/ai-community');
      setData(res);
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function togglePause() {
    if (!data) return;
    try {
      setToggling(true);
      await api('/admin/ai-community', 'POST', { paused: data.enabled });
      await loadData();
    } finally {
      setToggling(false);
    }
  }

  return (
    <main className="shell pad-card" style={{ maxWidth: 1000, margin: '40px auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" className="button secondary small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={14} /> Back
          </a>
          <h1 style={{ fontSize: 22, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={22} className="mint" /> AI Community Realism Dashboard
          </h1>
          <AiBadge size="md" />
        </div>
        <button className="button secondary small" onClick={loadData} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Control Card */}
      <div className="glass pad-card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span className="eyebrow">GLOBAL KILL SWITCH</span>
          <h3 style={{ margin: '4px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            Status: {data?.enabled ? (
              <span className="mint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={16} /> Operational
              </span>
            ) : (
              <span className="coral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={16} /> Paused via Kill Switch
              </span>
            )}
          </h3>
          <p className="muted-text text-xs" style={{ margin: 0 }}>
            {data?.enabled ? 'Autonomous ticks and scheduled persona content publishing active.' : 'All AI publishing and automated drafting are completely halted.'}
          </p>
        </div>
        <button
          className={`button small ${data?.enabled ? 'danger' : 'primary'}`}
          onClick={togglePause}
          disabled={toggling || !data}
        >
          {data?.enabled ? <><Pause size={14} /> Pause Community</> : <><Play size={14} /> Resume Community</>}
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="glass pad-card text-center">
          <span className="eyebrow">QUEUE DEPTH</span>
          <h2 className="mono mint" style={{ margin: '6px 0 0' }}>{data?.queue.ready ?? 0}</h2>
          <small className="muted-text text-xs">Ready to publish</small>
        </div>
        <div className="glass pad-card text-center">
          <span className="eyebrow">PUBLISHED TODAY</span>
          <h2 className="mono" style={{ margin: '6px 0 0' }}>{data?.queue.published ?? 0}</h2>
          <small className="muted-text text-xs">Delivered to public feeds</small>
        </div>
        <div className="glass pad-card text-center">
          <span className="eyebrow">QUALITY GATED OUT</span>
          <h2 className="mono coral" style={{ margin: '6px 0 0' }}>{data?.queue.rejected ?? 0}</h2>
          <small className="muted-text text-xs">Blocked by safety/repetition</small>
        </div>
      </div>

      {/* Realism Guarantees Card */}
      <div className="glass pad-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Shield size={16} className="mint" />
          <h4 style={{ margin: 0, fontSize: 14 }}>Realism & Integrity Commitments</h4>
        </div>
        <ul className="muted-text text-xs" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
          <li>Human stats, leaderboards, and Brier accuracy are 100% isolated via the <code>realUsersOnly()</code> wall.</li>
          <li>Every persona take and profile is permanently disclosed with accessible <code>&lt;AiBadge /&gt;</code> tags.</li>
          <li>Inter-action timing follows Hawkes-style self-exciting processes over-dispersed vs Poisson.</li>
        </ul>
      </div>

      {/* Recent Activity Log */}
      <div className="glass pad-card">
        <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Last 100 Audit Actions</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#8d989f' }}>
                <th style={{ padding: '6px 8px' }}>Time</th>
                <th style={{ padding: '6px 8px' }}>Persona</th>
                <th style={{ padding: '6px 8px' }}>Action</th>
                <th style={{ padding: '6px 8px' }}>Target</th>
                <th style={{ padding: '6px 8px' }}>Provider</th>
                <th style={{ padding: '6px 8px' }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentActions && data.recentActions.length > 0 ? (
                data.recentActions.map(act => (
                  <tr key={act.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '6px 8px' }} className="mono">{act.created_at.slice(11, 19)}</td>
                    <td style={{ padding: '6px 8px' }}><b>{act.persona_id}</b></td>
                    <td style={{ padding: '6px 8px' }}>
                      <span className="mono" style={{ textTransform: 'uppercase', fontSize: 10 }}>{act.action}</span>
                    </td>
                    <td style={{ padding: '6px 8px' }} className="mono">{act.target_id}</td>
                    <td style={{ padding: '6px 8px' }}>{act.provider}</td>
                    <td style={{ padding: '6px 8px' }} className="muted-text">{act.reason_code}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: 16, textAlign: 'center' }} className="muted-text">
                    No recent activity logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

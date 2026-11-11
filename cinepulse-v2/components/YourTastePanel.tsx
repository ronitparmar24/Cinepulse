'use client';
import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Trash2, X, RefreshCw, ShieldAlert, Heart, EyeOff } from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';
import type { FeedbackSummary } from '@/lib/feedback/affinity';

export function YourTastePanel() {
  const { user, toast, refresh } = useApp();
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!user) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api<FeedbackSummary>('/feedback/summary', 'GET');
      setSummary(res);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  async function handleRemoveAffinity(featureType: string, featureValue: string) {
    try {
      await api(`/feedback/affinity?featureType=${encodeURIComponent(featureType)}&featureValue=${encodeURIComponent(featureValue)}`, 'DELETE');
      toast(`Removed ${featureValue} from your taste profile.`);
      fetchSummary();
    } catch {
      toast('Failed to remove taste feature.');
    }
  }

  async function handleResetRecommendations() {
    setBusy(true);
    try {
      await api('/feedback/reset', 'POST');
      toast('Your recommendation profile has been completely reset.');
      setResetConfirm(false);
      fetchSummary();
      refresh();
    } catch {
      toast('Failed to reset recommendations.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="your-taste-panel glass pad-card" style={{ textAlign: 'center', padding: '24px' }}>
        <Sparkles size={24} className="mint" style={{ margin: '0 auto 12px' }} />
        <h4>Sign In to Control Your Taste</h4>
        <p className="muted text-xs" style={{ maxWidth: '360px', margin: '0 auto' }}>
          Your feedback shapes your recommendations across all devices. Sign in to view and curate your learned taste profile.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="your-taste-panel glass pad-card" style={{ padding: '20px' }}>
        <div className="skeleton-line" style={{ width: '40%', height: 16, marginBottom: 12 }} />
        <div className="skeleton-line" style={{ width: '80%', height: 12, marginBottom: 8 }} />
        <div className="skeleton-line" style={{ width: '60%', height: 12 }} />
      </div>
    );
  }

  const hasLiked = summary && summary.liked && summary.liked.length > 0;
  const hasSuppressed = summary && summary.suppressed && summary.suppressed.length > 0;
  const isEmpty = !hasLiked && !hasSuppressed;

  return (
    <div className="your-taste-panel glass pad-card" style={{ textAlign: 'left', width: '100%' }}>
      <div className="section-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} className="mint" />
          <h3 style={{ margin: 0, fontSize: '15px' }}>Your Learned Taste Profile</h3>
        </div>
        <button
          type="button"
          className="button secondary mini"
          onClick={fetchSummary}
          title="Refresh learned profile"
          aria-label="Refresh learned profile"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <p className="muted text-xs" style={{ marginBottom: '16px' }}>
        Learned automatically from your reviews, library adds, and Interested / Not Interested feedback. Each preference can be removed with one click.
      </p>

      {isEmpty ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#8d989f', fontSize: '13px' }}>
          <p>No learned affinities yet.</p>
          <p className="text-xs" style={{ marginTop: '4px' }}>
            Tap <strong>Interested</strong> or <strong>Not for me</strong> on recommendation cards to calibrate your feed.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Liked / Positive Affinities */}
          {hasLiked && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Heart size={14} className="mint" />
                <span className="mono text-xs" style={{ color: 'var(--neon-mint)', fontWeight: 700 }}>
                  WHAT YOU&apos;RE INTO ({summary!.liked.length})
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {summary!.liked.map((item) => (
                  <div
                    key={`liked-${item.featureType}-${item.featureValue}`}
                    className="taste-chip taste-chip-liked"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(0, 245, 155, 0.1)',
                      border: '1px solid rgba(0, 245, 155, 0.25)',
                      borderRadius: '16px',
                      padding: '4px 10px',
                      fontSize: '12px',
                    }}
                  >
                    <span>{item.featureValue}</span>
                    <span className="mono text-xs text-muted" style={{ opacity: 0.8 }}>
                      +{item.weight.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAffinity(item.featureType, item.featureValue)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#8d989f',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={`Remove ${item.featureValue}`}
                      aria-label={`Remove ${item.featureValue}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suppressed / Negative Affinities */}
          {hasSuppressed && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <EyeOff size={14} className="amber" />
                <span className="mono text-xs" style={{ color: '#f87171', fontWeight: 700 }}>
                  SUPPRESSED PREFERENCES ({summary!.suppressed.length})
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {summary!.suppressed.map((item) => (
                  <div
                    key={`suppressed-${item.featureType}-${item.featureValue}`}
                    className="taste-chip taste-chip-suppressed"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '16px',
                      padding: '4px 10px',
                      fontSize: '12px',
                    }}
                  >
                    <span>{item.featureValue}</span>
                    <span className="mono text-xs text-muted" style={{ opacity: 0.8 }}>
                      {item.weight.toFixed(1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAffinity(item.featureType, item.featureValue)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#8d989f',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={`Remove ${item.featureValue}`}
                      aria-label={`Remove ${item.featureValue}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reset Recommendations Control */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        {resetConfirm ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
              <ShieldAlert size={16} />
              <span>Reset all recommendations & taste feedback?</span>
            </div>
            <p className="text-xs muted" style={{ marginBottom: '12px' }}>
              This clears all your learned taste affinities and feedback history. Your library and reviews will NOT be deleted.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="button danger mini"
                onClick={handleResetRecommendations}
                disabled={busy}
              >
                {busy ? 'Resetting…' : 'Yes, Reset My Recommendations'}
              </button>
              <button
                type="button"
                className="button secondary mini"
                onClick={() => setResetConfirm(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="button secondary small"
            onClick={() => setResetConfirm(true)}
            style={{ fontSize: '12px' }}
          >
            <Trash2 size={13} />
            <span>Reset My Recommendations</span>
          </button>
        )}
      </div>
    </div>
  );
}

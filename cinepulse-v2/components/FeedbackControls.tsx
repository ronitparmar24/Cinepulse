'use client';
import { useState, useEffect, useRef } from 'react';
import { ThumbsUp, ThumbsDown, MoreHorizontal, RotateCcw, Check, EyeOff, Clock, Sparkles } from 'lucide-react';
import { api, trackEvent } from './client';
import { useApp } from './Context';
import type { Title } from '@/lib/types';
import type { FeedbackSignal, FeedbackReason } from '@/lib/feedback/signals';
import { saveLocalFeedback, removeLocalFeedback } from '@/lib/clientLocalFeedback';

export interface FeedbackControlsProps {
  title: Title | { id: string; title: string; [key: string]: any };
  surface?: string;
  compact?: boolean;
  showSocialProof?: boolean;
  onFeedbackGiven?: (signal: FeedbackSignal, nextSuggestion?: Title | null) => void;
  onUndo?: () => void;
}

export function FeedbackControls({
  title,
  surface = 'discovery',
  compact = false,
  showSocialProof = true,
  onFeedbackGiven,
  onUndo,
}: FeedbackControlsProps) {
  const { user, toast } = useApp();
  const titleId = String(title.id);

  const [currentSignal, setCurrentSignal] = useState<FeedbackSignal | null>(null);
  const [showReasonChips, setShowReasonChips] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [undoActive, setUndoActive] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState(6);
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');
  const [interestedSocialCount, setInterestedSocialCount] = useState<number | null>(null);

  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close more menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  // Social proof: real counts only, hidden if < 5
  useEffect(() => {
    if (!showSocialProof || !titleId) return;
    const controller = new AbortController();
    api<{ interestedCount: number | null }>(`/feedback/social-proof/${encodeURIComponent(titleId)}`, 'GET', undefined, controller.signal)
      .then((res) => {
        if (res && typeof res.interestedCount === 'number' && res.interestedCount >= 5) {
          setInterestedSocialCount(res.interestedCount);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [titleId, showSocialProof]);

  // Cleanup undo countdown on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    };
  }, []);

  function startUndoTimer() {
    setUndoActive(true);
    setUndoSeconds(6);
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    undoTimerRef.current = setInterval(() => {
      setUndoSeconds((prev) => {
        if (prev <= 1) {
          if (undoTimerRef.current) clearInterval(undoTimerRef.current);
          setUndoActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSignal(signal: FeedbackSignal, reason?: FeedbackReason | null) {
    setCurrentSignal(signal);
    setShowMoreMenu(false);

    // Analytics logging
    trackEvent('feedback_given', { signal, titleId, surface, reason: reason || null });

    if (signal === 'interested') {
      setPulsing(true);
      setAriaAnnouncement('Marked as interested. Recommendations updated.');
      setTimeout(() => setPulsing(false), 2000);
      toast('Got it, more like this!');
    } else {
      setAriaAnnouncement('Recommendation removed. Undo available for 6 seconds.');
      startUndoTimer();
    }

    let nextReplacement: Title | null = null;

    if (user) {
      try {
        const res = await api<{ ok: boolean; nextSuggestion?: any }>('/feedback/interest', 'POST', {
          titleId,
          signal,
          reason,
          surface,
          title,
        });
        if (res?.nextSuggestion?.title) {
          nextReplacement = res.nextSuggestion.title;
        }
      } catch {
        // Fallback gracefully
      }
    } else {
      // Anonymous visitor local storage persistence
      saveLocalFeedback(title, signal, reason, surface);
    }

    if (onFeedbackGiven) {
      onFeedbackGiven(signal, nextReplacement);
    }
  }

  async function handleUndo() {
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    setUndoActive(false);
    setCurrentSignal(null);
    setShowReasonChips(false);

    trackEvent('feedback_undo', { titleId, surface });
    setAriaAnnouncement('Action undone. Recommendation restored.');
    toast('Feedback undone. Card restored.');

    if (user) {
      try {
        await api(`/feedback/interest/${encodeURIComponent(titleId)}`, 'DELETE');
      } catch {}
    } else {
      removeLocalFeedback(titleId);
    }

    if (onUndo) {
      onUndo();
    }
  }

  return (
    <div
      className={`feedback-controls-wrap ${compact ? 'is-compact' : ''} ${pulsing ? 'pulse-active' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Screen reader live updates */}
      <div className="sr-only" aria-live="polite">
        {ariaAnnouncement}
      </div>

      {/* Undo Banner (active for 6s after not interested / already seen) */}
      {undoActive ? (
        <div className="feedback-undo-strip glass" role="alert">
          <span className="mono text-xs text-muted">Removed ({undoSeconds}s)</span>
          <button
            type="button"
            className="button secondary mini undo-btn"
            onClick={handleUndo}
            aria-label="Undo removing recommendation"
          >
            <RotateCcw size={12} />
            <span>Undo</span>
          </button>
        </div>
      ) : showReasonChips ? (
        /* Tell Us Why Chips */
        <div className="feedback-reason-strip glass animate-in">
          <span className="reason-prompt text-xs mono">Tell us why:</span>
          <div className="reason-chips-row">
            <button
              type="button"
              className="reason-chip"
              onClick={() => {
                setShowReasonChips(false);
                handleSignal('not_interested', 'not_my_genre');
              }}
            >
              Not my genre
            </button>
            <button
              type="button"
              className="reason-chip"
              onClick={() => {
                setShowReasonChips(false);
                handleSignal('not_interested', 'too_violent');
              }}
            >
              Too violent
            </button>
            <button
              type="button"
              className="reason-chip"
              onClick={() => {
                setShowReasonChips(false);
                handleSignal('already_seen', 'seen_it');
              }}
            >
              Seen it
            </button>
            <button
              type="button"
              className="reason-chip"
              onClick={() => {
                setShowReasonChips(false);
                handleSignal('not_interested', 'not_into_actor_director');
              }}
            >
              Not into actor/director
            </button>
            <button
              type="button"
              className="reason-chip"
              onClick={() => {
                setShowReasonChips(false);
                handleSignal('not_interested', 'language');
              }}
            >
              Wrong language
            </button>
            <button
              type="button"
              className="reason-chip chip-skip"
              onClick={() => setShowReasonChips(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        /* Standard Row: Interested, Not Interested, More Menu */
        <div className="feedback-buttons-row">
          {/* Interested Button */}
          <button
            type="button"
            className={`feedback-btn feedback-btn-interested ${currentSignal === 'interested' ? 'active' : ''}`}
            onClick={() => handleSignal('interested')}
            aria-pressed={currentSignal === 'interested'}
            aria-label={`Interested in ${title.title || 'this title'}`}
            title="Interested (Got it, more like this)"
          >
            <Sparkles size={14} className="icon-sparkle" />
            <ThumbsUp size={13} className="icon-thumb" />
            <span className="feedback-label">Interested</span>
          </button>

          {/* Not Interested Button */}
          <button
            type="button"
            className={`feedback-btn feedback-btn-not-interested ${currentSignal === 'not_interested' ? 'active' : ''}`}
            onClick={() => {
              setShowReasonChips(true);
              handleSignal('not_interested');
            }}
            aria-pressed={currentSignal === 'not_interested'}
            aria-label={`Not interested in ${title.title || 'this title'}`}
            title="Not interested"
          >
            <ThumbsDown size={13} />
            <span className="feedback-label">Not for me</span>
          </button>

          {/* More Actions Menu */}
          <div className="feedback-menu-container" ref={menuRef}>
            <button
              type="button"
              className="feedback-btn feedback-btn-more"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              aria-label="More feedback options"
              aria-expanded={showMoreMenu}
              title="More options"
            >
              <MoreHorizontal size={14} />
            </button>

            {showMoreMenu && (
              <div className="feedback-dropdown-menu glass pad-card" role="menu">
                <button
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => handleSignal('already_seen', 'seen_it')}
                >
                  <EyeOff size={13} className="mint" />
                  <span>Already seen</span>
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => handleSignal('snooze')}
                >
                  <Clock size={13} className="amber" />
                  <span>Remind me later (30d)</span>
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => handleSignal('not_interested', 'not_my_genre')}
                >
                  <span>Don&apos;t recommend this genre</span>
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => handleSignal('not_interested', 'not_into_actor_director')}
                >
                  <span>Don&apos;t recommend this director</span>
                </button>
              </div>
            )}
          </div>

          {/* Real Social Proof Indicator (>= 5 people) */}
          {interestedSocialCount !== null && (
            <span className="feedback-social-proof mono text-xs" title="Verified community interest">
              <Check size={11} className="mint" />
              <span>Interested: {interestedSocialCount}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

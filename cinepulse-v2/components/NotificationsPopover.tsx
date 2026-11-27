'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Bell, BellRing, Check, Heart, MessageCircle, PlayCircle, UserPlus, UserCheck, CheckCircle2, X } from 'lucide-react';
import type { NotificationRecord } from '@/lib/types';
import { api } from './client';
import { useApp } from './Context';
import { milestoneText } from '@/lib/goalText';

export function NotificationsBell({
  currentUser,
}: {
  currentUser: { id: string; username?: string; name: string } | null;
}) {
  const [unreadCount, setUnreadCountState] = useState(0);
  const [open, setOpen] = useState(false);
  // The pop-up plays a short shrink-back-into-the-bell before it unmounts.
  const [closing, setClosing] = useState(false);
  // "Mark all read" fades every row to its read state one after another.
  const [marking, setMarking] = useState<Set<number> | null>(null);
  // Bumped whenever the unread count goes up, so the badge pulses once for new arrivals.
  const [badgePulse, setBadgePulse] = useState(0);
  const lastCount = useRef(0);
  const closeTimer = useRef<number | undefined>(undefined);
  const markTimer = useRef<number | undefined>(undefined);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const { openTitle } = useApp();

  const setUnreadCount = useCallback((next: number | ((prev: number) => number)) => {
    setUnreadCountState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      lastCount.current = value;
      return value;
    });
  }, []);

  // Poll unread count every 30s while the tab is visible
  const checkUnread = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await api<{ count: number }>('/notifications/unread-count');
      const next = res.count || 0;
      if (next > lastCount.current) setBadgePulse((k) => k + 1);
      setUnreadCount(next);
    } catch {}
  }, [currentUser, setUnreadCount]);

  useEffect(() => () => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(markTimer.current);
  }, []);

  const close = useCallback((returnFocus = false) => {
    if (returnFocus) bellRef.current?.focus();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setOpen(false);
      return;
    }
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 170);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => { if (interval === undefined) interval = setInterval(checkUnread, 30_000); };
    const stop = () => { if (interval !== undefined) { clearInterval(interval); interval = undefined; } };
    // A hidden tab stops polling; coming back refreshes once and resumes.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { void checkUnread(); start(); }
      else stop();
    };
    void checkUnread();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [currentUser, checkUnread]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        close();
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    }
    if (open && !closing) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKey);
      };
    }
  }, [open, closing, close]);

  // Load notification history
  const loadNotifications = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await api<{ items: NotificationRecord[] }>('/notifications');
      setNotifications(res.items || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  function handleToggleOpen() {
    if (closing) {
      // Tapped again mid-close: grow straight back out.
      window.clearTimeout(closeTimer.current);
      setClosing(false);
    } else if (!open) {
      setOpen(true);
      void loadNotifications();
    } else {
      close();
    }
  }

  async function handleMarkAllRead() {
    try {
      await api('/notifications/read', 'POST');
      setUnreadCount(0);
      setMarking(new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)));
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
      window.clearTimeout(markTimer.current);
      markTimer.current = window.setTimeout(() => setMarking(null), 1100);
    } catch {}
  }

  async function handleAcceptFollow(followerId: string, notificationId: number) {
    try {
      await api(`/follows/requests/${followerId}/accept`, 'POST');
      // Mark notification read
      await api('/notifications/read', 'POST', { ids: [notificationId] });
      setNotifications((prev) => prev.map((n) => n.id === notificationId ? { ...n, readAt: new Date().toISOString(), type: 'followed_you' as any } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  }

  async function handleDeclineFollow(followerId: string, notificationId: number) {
    try {
      await api(`/follows/requests/${followerId}/decline`, 'POST');
      await api('/notifications/read', 'POST', { ids: [notificationId] });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  }

  if (!currentUser) return null;

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      <button
        ref={bellRef}
        className={`icon notif-bell${open && !closing ? ' is-open' : ''}`}
        onClick={handleToggleOpen}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open && !closing}
        aria-controls={open ? 'notifications-popover' : undefined}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span key={badgePulse} className="notif-badge" aria-hidden="true" style={{
            position: 'absolute',
            top: '-3px',
            right: '-3px',
            background: '#10b981',
            color: '#0b0e12',
            fontSize: '12px',
            fontWeight: 800,
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(16, 185, 129, 0.6)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {open && (
        <div
          id="notifications-popover"
          role="dialog"
          aria-label="Notifications"
          className={`glass notif-pop${closing ? ' is-closing' : ''}`}
          style={{
          position: 'absolute',
          top: '46px',
          right: '0',
          width: '360px',
          maxHeight: '480px',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(15, 21, 30, 0.96)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <strong style={{ fontSize: '15px' }}>Notifications</strong>
            {unreadCount > 0 && (
              <button
                className="text-link"
                style={{ fontSize: '12px', color: '#b3f3d5' }}
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0', fontSize: '13px' }}>
                Checking notifications…
              </p>
            ) : notifications.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0', fontSize: '13px' }}>
                You're all caught up! No notifications yet.
              </p>
            ) : (
              <div className={`notif-list${marking ? ' is-marking' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {notifications.map((n, index) => {
                  const actorName = n.actor?.displayName || n.actor?.username || n.actorDisplayName || 'Someone';
                  const isUnread = !n.readAt;

                  return (
                    <div
                      key={n.id}
                      className={`notif-item${isUnread ? ' is-unread' : ''}`}
                      style={{
                        '--i': Math.min(index, 10),
                        position: 'relative',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      } as React.CSSProperties}
                    >
                      {(isUnread || marking?.has(n.id)) && <span className={`notif-unread-dot${isUnread ? '' : ' is-leaving'}`} aria-hidden="true" />}
                      {isUnread && <span className="sr-only">Unread: </span>}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        {/* Icon based on type */}
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: n.type === 'liked_review' ? 'rgba(239, 68, 68, 0.2)' : n.type === 'commented' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: n.type === 'liked_review' ? '#f87171' : n.type === 'commented' ? '#38bdf8' : '#34d399',
                        }}>
                          {n.type === 'liked_review' ? <Heart size={14} fill="#f87171" /> : n.type === 'commented' ? <MessageCircle size={14} /> : n.type === 'release_day' ? <BellRing size={14} /> : n.type === 'now_streaming' ? <PlayCircle size={14} /> : n.type === 'milestone' ? <Trophy size={14} /> : <UserPlus size={14} />}
                        </div>

                        <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.4 }}>
                          {n.type === 'milestone' ? (
                            <div><strong style={{ color: '#fff' }}>{milestoneText(n.targetId)}</strong></div>
                          ) : n.type === 'release_day' ? (
                            <button
                              type="button"
                              className="notif-release"
                              onClick={() => { setOpen(false); if (n.title?.id || n.targetId) openTitle(n.title?.id || String(n.targetId)); }}
                            >
                              {n.title?.poster && <img src={n.title.poster} alt="" width={34} height={51} />}
                              <span><strong style={{ color: '#fff' }}>{n.title?.title || 'A title you’re waiting for'}</strong> is out today. <span style={{ color: '#b3f3d5' }}>Open it →</span></span>
                            </button>
                          ) : n.type === 'now_streaming' ? (
                            <button
                              type="button"
                              className="notif-release"
                              onClick={() => { setOpen(false); const id = n.title?.id || String(n.targetId || '').split('|')[0]; if (id) openTitle(id); }}
                            >
                              {n.title?.poster && <img src={n.title.poster} alt="" width={34} height={51} />}
                              <span><strong style={{ color: '#fff' }}>{n.title?.title || 'A title on your watchlist'}</strong> is now on {n.provider || 'one of your services'}. <span style={{ color: '#b3f3d5' }}>Open it →</span></span>
                            </button>
                          ) : n.type === 'taste_recommendation' ? (
                            <div>
                              <strong style={{ color: 'var(--neon-mint)' }}>Taste Match:</strong> A film matching your taste is now in theaters!
                            </div>
                          ) : n.type === 'follow_request' ? (
                            <div>
                              <strong style={{ color: '#fff' }}>{actorName}</strong> requested to follow your private profile.
                            </div>
                          ) : n.type === 'followed_you' ? (
                            <div>
                              <strong style={{ color: '#fff' }}>{actorName}</strong> started following you.
                            </div>
                          ) : n.type === 'liked_review' ? (
                            <div>
                              <strong style={{ color: '#fff' }}>{actorName}</strong> liked your review.
                            </div>
                          ) : n.type === 'commented' ? (
                            <div>
                              <strong style={{ color: '#fff' }}>{actorName}</strong> commented on your post.
                            </div>
                          ) : (
                            <div>
                              Notification from <strong style={{ color: '#fff' }}>{actorName}</strong>.
                            </div>
                          )}

                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      {/* Follow Request inline actions */}
                      {n.type === 'follow_request' && (
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '38px', marginTop: '4px' }}>
                          <button
                            className="button primary"
                            style={{ fontSize: '12px', padding: '4px 10px', height: 'auto' }}
                            onClick={() => handleAcceptFollow(n.actorId, n.id)}
                          >
                            Accept
                          </button>
                          <button
                            className="button secondary"
                            style={{ fontSize: '12px', padding: '4px 10px', height: 'auto' }}
                            onClick={() => handleDeclineFollow(n.actorId, n.id)}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

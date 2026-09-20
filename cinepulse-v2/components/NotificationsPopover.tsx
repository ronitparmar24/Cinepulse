'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, Heart, MessageCircle, UserPlus, UserCheck, CheckCircle2, X } from 'lucide-react';
import type { NotificationRecord } from '@/lib/types';
import { api } from './client';

export function NotificationsBell({
  currentUser,
}: {
  currentUser: { id: string; username?: string; name: string } | null;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Poll unread count every 30s as specified
  const checkUnread = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await api<{ count: number }>('/notifications/unread-count');
      setUnreadCount(res.count || 0);
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    checkUnread();
    const interval = setInterval(checkUnread, 30_000);
    return () => clearInterval(interval);
  }, [currentUser, checkUnread]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

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
    if (!open) {
      setOpen(true);
      loadNotifications();
    } else {
      setOpen(false);
    }
  }

  async function handleMarkAllRead() {
    try {
      await api('/notifications/read', 'POST');
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
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
        className="icon"
        onClick={handleToggleOpen}
        aria-label="Notifications"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-3px',
            right: '-3px',
            background: '#10b981',
            color: '#0b0e12',
            fontSize: '11px',
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
        <div className="glass" style={{
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {notifications.map((n) => {
                  const actorName = n.actor?.displayName || n.actor?.username || n.actorDisplayName || 'Someone';
                  const isUnread = !n.readAt;

                  return (
                    <div
                      key={n.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: isUnread ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                        borderLeft: isUnread ? '3px solid #10b981' : '3px solid transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'background 0.2s',
                      }}
                    >
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
                          {n.type === 'liked_review' ? <Heart size={14} fill="#f87171" /> : n.type === 'commented' ? <MessageCircle size={14} /> : <UserPlus size={14} />}
                        </div>

                        <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.4 }}>
                          {n.type === 'follow_request' ? (
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

                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      {/* Follow Request inline actions */}
                      {n.type === 'follow_request' && (
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '38px', marginTop: '4px' }}>
                          <button
                            className="button primary"
                            style={{ fontSize: '11px', padding: '4px 10px', height: 'auto' }}
                            onClick={() => handleAcceptFollow(n.actorId, n.id)}
                          >
                            Accept
                          </button>
                          <button
                            className="button secondary"
                            style={{ fontSize: '11px', padding: '4px 10px', height: 'auto' }}
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

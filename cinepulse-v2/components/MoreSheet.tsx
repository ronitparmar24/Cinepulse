'use client';
import { Popcorn, Download, Bookmark, CalendarDays, Trophy, ShieldCheck, Rss, Zap, User as UserIcon, LogIn, Info, ChevronRight, X, Sparkles, Users, MapPin } from 'lucide-react';
import type { User } from '@/lib/types';
import type { View } from '@/lib/navigation';
import { Modal } from './UI';
import { wrappedYear } from '@/lib/wrappedClient';
import { useState } from 'react';
import { useInstallMode } from './InstallPrompt';
import { openTonight } from './TonightPick';
import { promptInstall } from '@/lib/installPrompt';

export interface MoreSheetProps {
  user: User | null;
  currentView: View;
  onNavigate: (view: View) => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAbout: () => void;
  onOpenTheaters?: () => void;
  onOpenWrapped?: () => void;
  onClose: () => void;
}

const moreDestinations: { id: View; label: string; description: string; Icon: any }[] = [
  { id: 'library', label: 'My Library', description: 'Your watchlist, watched history and ratings', Icon: Bookmark },
  { id: 'movie-night', label: 'Movie Night Generator', description: 'Group decision engine & Borda voting', Icon: Sparkles },
  { id: 'circles', label: 'Watch Circles', description: 'Private film clubs & shared weekly picks', Icon: Users },
  { id: 'calendar', label: 'Calendar', description: 'Theatrical & digital release timelines', Icon: CalendarDays },
  { id: 'leaderboard', label: 'Leaderboard', description: 'Community predictors vs CinePulse Engine', Icon: Trophy },
  { id: 'accuracy', label: 'Accuracy Desk', description: 'Model calibration, Brier score, and MAE audits', Icon: ShieldCheck },
  { id: 'feed', label: 'Activity Feed', description: 'Real-time forecasts and reviews from film lovers', Icon: Rss },
  { id: 'contrarian', label: 'Contrarian Desk', description: 'Model vs Crowd divergent opportunities', Icon: Zap },
];

export function MoreSheet({
  user,
  currentView,
  onNavigate,
  onOpenProfile,
  onOpenAuth,
  onOpenAbout,
  onOpenTheaters,
  onOpenWrapped,
  onClose,
}: MoreSheetProps) {
  const installMode = useInstallMode();
  const [iosHelp, setIosHelp] = useState(false);
  return (
    <Modal label="More destinations" onClose={onClose}>
      <div className="more-sheet-content" style={{ padding: '28px 24px 34px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <span className="eyebrow mint" style={{ fontSize: '12px' }}>EXPLORE CINEPULSE</span>
            <h2 style={{ fontSize: '24px', fontWeight: 600, marginTop: '4px' }}>More Destinations</h2>
          </div>
        </div>

        {/* User Account / Profile Card */}
        <div
          className="glass"
          style={{
            padding: '16px',
            borderRadius: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #b3f3d5, #557568)',
                color: '#0e2419',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '16px',
              }}
            >
              {user ? user.name.slice(0, 1).toUpperCase() : <UserIcon size={18} />}
            </div>
            <div>
              <div style={{ fontWeight: 650, fontSize: '14px' }}>{user ? user.name : 'Anonymous Guest'}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {user ? user.email : 'Sign in to sync your Taste DNA & predictions'}
              </div>
            </div>
          </div>
          <button
            className="button primary small"
            style={{ padding: '8px 14px', minHeight: '34px', fontSize: '12px' }}
            onClick={() => {
              onClose();
              if (user) {
                onOpenProfile();
              } else {
                onOpenAuth();
              }
            }}
          >
            {user ? 'My Profile' : 'Sign In'}
          </button>
        </div>

        {/* Wrapped: your year in film (signed-in members) */}
        {user && onOpenWrapped && (
          <button
            type="button"
            className="wrapped-entry"
            onClick={() => {
              onClose();
              setTimeout(onOpenWrapped, 80);
            }}
          >
            <span className="wrapped-entry-icon"><Sparkles size={18} /></span>
            <span className="wrapped-entry-text">
              <b>Your {wrappedYear()} Wrapped</b>
              <small>Your year in film, ready to share</small>
            </span>
            <ChevronRight size={16} />
          </button>
        )}

        {user && (
          <button
            type="button"
            className="wrapped-entry tonight-entry"
            onClick={() => {
              onClose();
              setTimeout(openTonight, 80);
            }}
          >
            <span className="wrapped-entry-icon"><Popcorn size={18} /></span>
            <span className="wrapped-entry-text">
              <b>Tonight’s pick</b>
              <small>One film from your watchlist that fits your evening</small>
            </span>
            <ChevronRight size={16} />
          </button>
        )}

        {/* Live Theater Locator Card */}
        {onOpenTheaters && (
          <button
            onClick={() => {
              onClose();
              onOpenTheaters();
            }}
            className="glass clickable-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              borderRadius: '14px',
              border: '1px solid rgba(179,243,213,0.25)',
              background: 'linear-gradient(135deg, rgba(179,243,213,0.08), rgba(15,23,42,0.4))',
              marginBottom: '16px',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--mint)',
                color: '#0e2419',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <MapPin size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 650, fontSize: '13px', color: 'var(--mint)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Cinemas Near You <span className="mono text-xs" style={{ fontSize: 11, background: 'rgba(179,243,213,0.18)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>LIVE GPS</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                Locate PVR INOX, Cinépolis & local screens via OpenStreetMap
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--mint)', opacity: 0.8 }} />
          </button>
        )}

        {/* Destination List */}
        <div className="more-dest-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {moreDestinations.map(({ id, label, description, Icon }, index) => {
            const isActive = currentView === id;
            return (
              <button
                key={id}
                onClick={() => {
                  onNavigate(id);
                  onClose();
                }}
                className={`glass more-dest ${isActive ? 'active-dest' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  // Stagger index for the entrance in chrome.css.
                  ['--i' as string]: index,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  textAlign: 'left',
                  width: '100%',
                  borderColor: isActive ? 'var(--mint)' : 'rgba(224, 243, 241, 0.1)',
                  background: isActive ? 'rgba(179, 243, 213, 0.08)' : undefined,
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: isActive ? 'var(--mint)' : 'rgba(179, 243, 213, 0.08)',
                    color: isActive ? '#0e2419' : 'var(--mint)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: isActive ? 'var(--mint)' : 'var(--text)' }}>
                    {label}
                  </div>
                  <div className="more-dest-desc" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{description}</div>
                </div>
                <ChevronRight className="more-dest-chev" size={16} style={{ color: 'var(--muted)', opacity: 0.7 }} />
              </button>
            );
          })}
        </div>

        {/* Install the app (only when this browser can, and it isn't installed yet) */}
        {installMode && (
          <div className="more-install">
            <button
              type="button"
              className="more-install-btn"
              onClick={() => (installMode === 'prompt' ? void promptInstall() : setIosHelp((v) => !v))}
            >
              <img src="/icons/icon-192.png" alt="" width={36} height={36} />
              <span>
                <b>Install the CinePulse app</b>
                <small>{installMode === 'ios' ? 'Add it to your home screen' : 'Full screen, one tap away'}</small>
              </span>
              <Download size={16} />
            </button>
            {installMode === 'ios' && iosHelp && (
              <p className="more-install-help">In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</p>
            )}
          </div>
        )}

        {/* Methodology & About */}
        <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <button
            onClick={() => {
              onClose();
              onOpenAbout();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--muted)',
              width: '100%',
              padding: '6px 0',
            }}
          >
            <Info size={14} className="mint" />
            <span>How Cinepulse works · Methodology & Data Sources</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

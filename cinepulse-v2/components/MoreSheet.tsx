'use client';
import { CalendarDays, Trophy, ShieldCheck, Rss, Zap, User as UserIcon, LogIn, Info, ChevronRight, X } from 'lucide-react';
import type { User } from '@/lib/types';
import type { View } from '@/lib/navigation';
import { Modal } from './UI';

export interface MoreSheetProps {
  user: User | null;
  currentView: View;
  onNavigate: (view: View) => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAbout: () => void;
  onClose: () => void;
}

const moreDestinations: { id: View; label: string; description: string; Icon: any }[] = [
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
  onClose,
}: MoreSheetProps) {
  return (
    <Modal label="More destinations" onClose={onClose}>
      <div className="more-sheet-content" style={{ padding: '28px 24px 34px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <span className="eyebrow mint" style={{ fontSize: '9px' }}>EXPLORE CINEPULSE</span>
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
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {user ? user.email : 'Sign in to sync your Taste DNA & predictions'}
              </div>
            </div>
          </div>
          <button
            className="button primary small"
            style={{ padding: '8px 14px', minHeight: '34px', fontSize: '11px' }}
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

        {/* Destination List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {moreDestinations.map(({ id, label, description, Icon }) => {
            const isActive = currentView === id;
            return (
              <button
                key={id}
                onClick={() => {
                  onNavigate(id);
                  onClose();
                }}
                className={`glass ${isActive ? 'active-dest' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  textAlign: 'left',
                  width: '100%',
                  borderColor: isActive ? 'var(--mint)' : 'rgba(224, 243, 241, 0.1)',
                  background: isActive ? 'rgba(179, 243, 213, 0.08)' : undefined,
                  transition: 'all 0.15s ease',
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
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{description}</div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--muted)', opacity: 0.7 }} />
              </button>
            );
          })}
        </div>

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
              fontSize: '11px',
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

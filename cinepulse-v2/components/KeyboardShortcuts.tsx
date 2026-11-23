'use client';
/**
 * Keyboard-first navigation: "?" opens a cheat sheet, "g" then a letter jumps between views,
 * "t" scrolls to top ("/" already opens Ask CinePulse, Ctrl/⌘ K opens search). Keys are ignored while typing or when a dialog is open.
 */
import { useEffect, useRef } from 'react';
import { Keyboard } from 'lucide-react';
import type { View } from '@/lib/navigation';
import { Modal } from './UI';

export const GO_KEYS: Array<{ key: string; view: View; label: string }> = [
  { key: 'h', view: 'discover', label: 'Home' },
  { key: 'e', view: 'explore', label: 'Explore' },
  { key: 'c', view: 'calendar', label: 'Release calendar' },
  { key: 'p', view: 'predictions', label: 'Open calls' },
  { key: 'r', view: 'receipts', label: 'Receipts' },
  { key: 'b', view: 'leaderboard', label: 'Leaderboard' },
  { key: 'm', view: 'community', label: 'Community reviews' },
  { key: 'l', view: 'library', label: 'My library' },
];

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useKeyboardShortcuts({
  onNavigate,
  onHelp,
}: {
  onNavigate: (v: View) => void;
  onHelp: () => void;
}) {
  const handlers = useRef({ onNavigate, onHelp });
  useEffect(() => {
    handlers.current = { onNavigate, onHelp };
  });

  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('dialog[open], .command-palette-backdrop, .chat-panel-backdrop, .surprise-overlay')) return;
      const key = e.key;
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const hit = GO_KEYS.find((g) => g.key === key.toLowerCase());
        if (hit) {
          e.preventDefault();
          handlers.current.onNavigate(hit.view);
        }
        return;
      }
      if (key === 'g') {
        pendingG = Date.now();
      } else if (key === '?') {
        e.preventDefault();
        handlers.current.onHelp();
      } else if (key === 't') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="ks-keys">
      {keys.map((k, i) => (
        <span key={i}>
          {i > 0 && <i>then</i>}
          <kbd>{k}</kbd>
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ shortcut, onClose }: { shortcut: string; onClose: () => void }) {
  const general: Array<{ keys: string[]; label: string }> = [
    { keys: [shortcut], label: 'Search films, people and actions' },
    { keys: ['/'], label: 'Ask CinePulse (AI assistant)' },
    { keys: ['?'], label: 'Show this cheat sheet' },
    { keys: ['t'], label: 'Back to top' },
    { keys: ['Esc'], label: 'Close any dialog' },
  ];
  return (
    <Modal label="Keyboard shortcuts" onClose={onClose}>
      <div className="ks">
        <div className="ks-head">
          <span className="signal-icon"><Keyboard size={20} /></span>
          <div>
            <h2>Keyboard shortcuts</h2>
            <p>Move around CinePulse without touching the mouse.</p>
          </div>
        </div>
        <div className="ks-grid">
          <section>
            <h3>General</h3>
            {general.map((row) => (
              <div className="ks-row" key={row.label}>
                <span>{row.label}</span>
                <Keys keys={row.keys} />
              </div>
            ))}
          </section>
          <section>
            <h3>Go to</h3>
            {GO_KEYS.map((g) => (
              <div className="ks-row" key={g.key}>
                <span>{g.label}</span>
                <Keys keys={['g', g.key]} />
              </div>
            ))}
          </section>
        </div>
      </div>
    </Modal>
  );
}

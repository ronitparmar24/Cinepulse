'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from './client';
import { Activity, AlertCircle, ArrowUpRight, Bookmark, Check, Compass, Globe, Keyboard, Search, Users, X, ShieldCheck, Sparkles } from 'lucide-react';
import { AppContext } from './Context';
import { Logo, Methodology, Modal } from './UI';
import { Discovery } from './Discovery';
import { NotificationsBell } from './NotificationsPopover';
import { useToast } from './hooks/useToast';
import { shouldOfferHealthRetry, useCatalogHealth } from './hooks/useCatalogHealth';
import { useTitleModal } from './hooks/useTitleModal';
import { useNavigation } from './hooks/useNavigation';
import dynamic from 'next/dynamic';
import { useAuth } from './hooks/useAuth';
import { useLibrary } from './hooks/useLibrary';
import { ChatLauncher } from './chat/ChatLauncher';
import { NAV_SECTIONS, VIEW_LABELS, sectionOf, type View } from '@/lib/navigation';
import { useSectionReveal } from './hooks/useSectionReveal';
import { useSlidingIndicator } from './hooks/useSlidingIndicator';
import { usePointerFx } from './hooks/usePointerFx';
import { BackToTop } from './BackToTop';
import { InstallPrompt } from './InstallPrompt';
import { useKeyboardShortcuts } from './KeyboardShortcuts';
import { OPEN_WRAPPED_EVENT, openWrapped, wrappedYear } from '@/lib/wrappedClient';

// Only the default view (Discover) ships with the first page load; every other view, the
// title modal and the account dialogs are fetched the first time they are opened.
function ViewLoading() {
  return <div className="loading" role="status">Loading…</div>;
}
const TitleDetail = dynamic(() => import('./TitleDetail').then((m) => m.TitleDetail), { ssr: false });
const AuthDialog = dynamic(() => import('./Account').then((m) => m.AuthDialog), { ssr: false });
const ProfileDialog = dynamic(() => import('./Account').then((m) => m.ProfileDialog), { ssr: false });
const WelcomePopup = dynamic(() => import('./WelcomePopup').then((m) => m.WelcomePopup), { ssr: false });
const MoreSheet = dynamic(() => import('./MoreSheet').then((m) => m.MoreSheet), { ssr: false });
const Community = dynamic(() => import('./Spaces').then((m) => m.Community), { loading: ViewLoading });
const Library = dynamic(() => import('./Spaces').then((m) => m.Library), { loading: ViewLoading });
const PredictionHub = dynamic(() => import('./Spaces').then((m) => m.PredictionHub), { loading: ViewLoading });
const ActivityFeed = dynamic(() => import('./ActivityFeed').then((m) => m.ActivityFeed), { loading: ViewLoading });
const AccuracyView = dynamic(() => import('./AccuracyView').then((m) => m.AccuracyView), { loading: ViewLoading });
const LeaderboardView = dynamic(() => import('./LeaderboardView').then((m) => m.LeaderboardView), { loading: ViewLoading });
const ContrarianDesk = dynamic(() => import('./ContrarianDesk').then((m) => m.ContrarianDesk), { loading: ViewLoading });
const MovieNightView = dynamic(() => import('./MovieNightView').then((m) => m.MovieNightView), { loading: ViewLoading });
const WatchCirclesView = dynamic(() => import('./WatchCirclesView').then((m) => m.WatchCirclesView), { loading: ViewLoading });
const ExplorePage = dynamic(() => import('./ExplorePage').then((m) => m.ExplorePage), { loading: ViewLoading });
const ReceiptsView = dynamic(() => import('./ReceiptsView').then((m) => m.ReceiptsView), { loading: ViewLoading });
const WrappedStory = dynamic(() => import('./WrappedStory').then((m) => m.WrappedStory), { ssr: false });
const NearbyTheatersModal = dynamic(() => import('./NearbyTheatersModal').then(m => m.NearbyTheatersModal), { ssr: false });
const CommandPalette = dynamic(() => import('./CommandPalette').then(m => m.CommandPalette), { ssr: false });
const ShortcutsDialog = dynamic(() => import('./KeyboardShortcuts').then(m => m.ShortcutsDialog), { ssr: false });

const FOOTER_LINKS: Array<{ heading: string; links: Array<{ label: string; view: View }> }> = [
  { heading: 'Discover', links: [{ label: 'Home', view: 'discover' }, { label: 'Explore', view: 'explore' }, { label: 'Release calendar', view: 'calendar' }] },
  { heading: 'Predict', links: [{ label: 'Open calls', view: 'predictions' }, { label: 'Receipts', view: 'receipts' }, { label: 'Leaderboard', view: 'leaderboard' }, { label: 'Accuracy', view: 'accuracy' }] },
  { heading: 'Community', links: [{ label: 'Reviews', view: 'community' }, { label: 'Activity', view: 'feed' }, { label: 'Watch circles', view: 'circles' }, { label: 'Movie night', view: 'movie-night' }] },
];

function toastTone(text: string): 'warn' | 'ok' {
  return /could not|couldn.t|failed|error|unable|not available|sign in|try again|too many|invalid/i.test(text) ? 'warn' : 'ok';
}

const SECTION_ICONS = { home: Compass, films: Sparkles, predict: Activity, community: Users, you: Bookmark } as const;

export default function Cinepulse({
  initialView,
  initialTitleId,
}: {
  initialView?: View;
  initialTitleId?: string;
} = {}) {
  const [about, setAbout] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [theatersOpen, setTheatersOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);

  // Global Command Palette shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Hook 1: Toast notifications
  const { message, toast, clearToast } = useToast();

  // Hook 2: Catalog provider health
  const { config, healthBusy, healthLabel, retryHealth } = useCatalogHealth({ toast });

  // Hook 3: Navigation & URL history sync
  const { view, setView, search, setSearch, shortcut, searchRef, navigate, updateUrl } = useNavigation({
    initialView,
    onSyncTitle: (titleId, tab) => {
      setSelected((prev) => {
        if (!titleId) return null;
        if (prev && prev.id === titleId && prev.tab === tab) return prev;
        return { id: titleId, tab };
      });
    },
    onNavigateTitle: () => setSelected(null),
  });

  // Hook 4: Movie Room selected title modal
  const { selected, setSelected, openTitle, changeTitleTab, closeTitle } = useTitleModal({ view, updateUrl });

  // Hook 5: Authentication & current user session
  const { user, auth, setAuth, profile, setProfile, welcomeUser, setWelcomeUser, refresh, needAuth, showAuth } = useAuth({
    toast,
  });

  // Hook 6: Library mutations (watchlist, ratings, removals)
  const { library, busyIds, pendingRemoval, setPendingRemoval, save, remove, updateLibrary, confirmRemoval } = useLibrary({
    user,
    needAuth,
    toast,
    refreshAuth: refresh,
  });

  const refreshApp = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // Track M1: Region switcher (IN default if browser locale is en-IN, else US) stored in user profile
  // Start with 'US' as SSR-safe static default; update on client after mount to avoid hydration mismatch.
  const [region, setRegionState] = useState<string>('US');

  useEffect(() => {
    // Runs only on client — safe to access localStorage and navigator here
    const saved = localStorage.getItem('cinepulse_region');
    if (saved) {
      setRegionState(saved);
    } else {
      const browserLang = (navigator.language || (navigator.languages && navigator.languages[0])) || '';
      const detected = browserLang.toLowerCase().includes('in') ? 'IN' : 'US';
      setRegionState(detected);
    }
  }, []);

  const setRegion = useCallback((newRegion: string) => {
    setRegionState(newRegion);
    try {
      localStorage.setItem('cinepulse_region', newRegion);
    } catch {}
    // Persist to the account (POST /api/profile; there is no PUT /api/user/profile route).
    if (user?.id) {
      api('/profile', 'POST', { region: newRegion })
        .then(() => refresh())
        .catch(() => {});
    }
  }, [user?.id, refresh]);

  // Adopt the account's saved region when it loads or changes. Depends on user.region only:
  // also depending on `region` re-applied the stale account value right after every toggle,
  // snapping the switch back for signed-in users.
  useEffect(() => {
    if (!user?.region) return;
    setRegionState(user.region);
    try {
      localStorage.setItem('cinepulse_region', user.region);
    } catch {}
  }, [user?.region]);

  const health = config?.health;

  // Header sits transparent over the page top and turns to frosted glass once scrolled.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Sections across every view rise in as they scroll into view.
  useSectionReveal(view);

  // Sliding pills behind the active item of the main nav and the section sub-nav.
  const mainNav = useSlidingIndicator<HTMLElement>(view);
  const subNav = useSlidingIndicator<HTMLElement>(view);

  // Delegated pointer effects (poster tilt + glare, card spotlight, cursor glow).
  usePointerFx();

  // Wrapped opens from anywhere (profile, You sheet, home banner) through one event.
  const userRefForWrapped = useRef(user);
  userRefForWrapped.current = user;
  useEffect(() => {
    const open = () => (userRefForWrapped.current ? setWrappedOpen(true) : setAuth(true));
    window.addEventListener(OPEN_WRAPPED_EVENT, open);
    return () => window.removeEventListener(OPEN_WRAPPED_EVENT, open);
  }, [setAuth]);

  // "?" cheat sheet, "g" + letter view jumps, "t" back to top.
  useKeyboardShortcuts({ onNavigate: navigate, onHelp: () => setShortcutsOpen(true) });

  return (
    <AppContext.Provider
      value={{
        user,
        config,
        library,
        openTitle,
        save,
        remove,
        updateLibrary,
        refresh: refreshApp,
        toast,
        needAuth,
        showAuth,
        busyIds,
        region,
        setRegion,
      }}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="ambient" aria-hidden="true" />
      <div className="page-ambient" aria-hidden="true" />
      <div className="scroll-progress" aria-hidden="true" />
      <div className="cursor-glow" aria-hidden="true" />

      <header className={`header ${scrolled ? 'is-scrolled' : 'is-top'}`}>
        <button className="brand-button" onClick={() => navigate('discover')} aria-label="Cinepulse home">
          <Logo />
        </button>
        <nav
          ref={mainNav.ref}
          className="desktop-nav glass"
          style={mainNav.style}
          aria-label="Main navigation"
          onWheel={(e) => {
            if (e.deltaY !== 0) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          <span className={`nav-indicator ${mainNav.ready ? 'is-ready' : ''}`} aria-hidden="true" />
          {NAV_SECTIONS.map((section) => {
            const Icon = SECTION_ICONS[section.id];
            const active = sectionOf(view).id === section.id;
            return (
              <button
                key={section.id}
                onClick={() => navigate(section.views[0])}
                className={active ? 'active' : ''}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={13} className="nav-icon" />
                <span>{section.label}</span>
                {section.id === 'predict' && <i className="mini-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="header-right">
          {/* The read-only input is the control (it opens the command palette); the wrapper is
              not interactive, so the clear button is not nested inside another control. */}
          <div className="header-search" onClick={() => setCommandPaletteOpen(true)} style={{ cursor: 'pointer' }}>
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              placeholder="Find your next…"
              value={search}
              readOnly
              style={{ cursor: 'pointer' }}
              aria-label={`Search films, series and actions (${shortcut})`}
              aria-haspopup="dialog"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCommandPaletteOpen(true);
                }
              }}
            />
            {search ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSearch('');
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd>{shortcut}</kbd>
            )}
          </div>
          <button
            type="button"
            className="region-badge-btn"
            onClick={() => setRegion(region === 'IN' ? 'US' : 'IN')}
            title={`Region: ${region === 'IN' ? 'India' : 'United States'} — click to switch`}
            aria-label={`Region: ${region === 'IN' ? 'India' : 'United States'}. Switch region`}
          >
            <Globe size={13} aria-hidden="true" />
            <span>{region}</span>
          </button>
          <NotificationsBell currentUser={user} />
          <button
            className={`avatar ${user ? 'has-user' : 'anonymous'}`}
            onClick={() => (user ? setProfile(true) : setAuth(true))}
            aria-label={user ? 'Open your profile' : 'Sign in'}
            title={user ? `${user.name} (${user.email})` : 'Sign in'}
          >
            {user?.avatarUrl?.startsWith('https://') ? (
              <img className="avatar-photo" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : user ? (
              user.name.slice(0, 1).toUpperCase()
            ) : (
              <Users size={16} />
            )}
            <i />
          </button>
        </div>
      </header>

      <div className="mode-line">
        <span title={health?.message || undefined} aria-live="polite">
          <span className={`status-dot ${health?.status === 'verified' ? 'live' : ''}`} aria-hidden="true" />
          {healthLabel}
        </span>
        {shouldOfferHealthRetry(config) && (
          <button className="health-retry" onClick={retryHealth} disabled={healthBusy}>
            {healthBusy ? 'Checking…' : 'Retry connection'}
          </button>
        )}
        <button onClick={() => setAbout(true)}>
          Real accounts. Transparent predictions. <ArrowUpRight size={12} />
        </button>
      </div>

      <main id="main" tabIndex={-1}>
        {sectionOf(view).views.length > 1 && (
          <nav className="section-subnav" ref={subNav.ref} style={subNav.style} aria-label={`${sectionOf(view).label} views`}>
            <span className={`subnav-indicator ${subNav.ready ? 'is-ready' : ''}`} aria-hidden="true" />
            {sectionOf(view).views.map((v) => (
              <button key={v} onClick={() => navigate(v)} className={view === v ? 'active' : ''} aria-current={view === v ? 'page' : undefined}>
                {VIEW_LABELS[v]}
              </button>
            ))}
          </nav>
        )}
        {view === 'discover' || view === 'calendar' ? (
          <Discovery search={search} calendar={view === 'calendar'} />
        ) : view === 'explore' ? (
          <ExplorePage
            onOpenTitle={openTitle}
            onOpenProfile={(username) => { window.location.href = `/u/${encodeURIComponent(username)}`; }}
            onOpenList={(id) => { /* future: open list detail modal */ }}
          />
        ) : view === 'predictions' ? (
          <PredictionHub />
        ) : view === 'movie-night' ? (
          <MovieNightView />
        ) : view === 'circles' ? (
          <WatchCirclesView />
        ) : view === 'contrarian' ? (
          <div className="section">
            <ContrarianDesk />
          </div>
        ) : view === 'leaderboard' ? (
          <LeaderboardView />
        ) : view === 'accuracy' ? (
          <AccuracyView />
        ) : view === 'receipts' ? (
          <ReceiptsView onOpenTitle={openTitle} />
        ) : view === 'community' ? (
          <Community />
        ) : view === 'feed' ? (
          <ActivityFeed />
        ) : (
          <Library />
        )}
      </main>

      <section className="bottom-banner">
        <div className="banner-icon">
          <Activity size={27} />
        </div>
        <div>
          <span className="eyebrow">A LITTLE CURIOSITY. A BETTER MOVIE NIGHT.</span>
          <h3>Discover it. Save it. Call it before the credits.</h3>
        </div>
        <button className="button secondary" onClick={() => (user ? navigate('predictions') : setAuth(true))}>
          {user ? 'Explore predictions' : 'Make it yours'} <ArrowUpRight size={16} />
        </button>
      </section>

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <Logo />
            <p>For the love of what’s next. Discover it, save it, and call it before the credits — with every number showing its evidence.</p>
            <button type="button" className="footer-kbd" onClick={() => setShortcutsOpen(true)}>
              <Keyboard size={14} aria-hidden="true" /> Keyboard shortcuts <kbd>?</kbd>
            </button>
          </div>
          <nav className="footer-cols" aria-label="Footer">
            {FOOTER_LINKS.map((col) => (
              <div key={col.heading}>
                <h4>{col.heading}</h4>
                {col.links.map((l) => (
                  <button key={l.view} type="button" onClick={() => { navigate(l.view); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    {l.label}
                  </button>
                ))}
              </div>
            ))}
            <div>
              <h4>CinePulse</h4>
              <button type="button" onClick={() => setAbout(true)}>How it works</button>
              <button type="button" onClick={() => (user ? navigate('library') : setAuth(true))}>My library</button>
              <button type="button" onClick={() => setCommandPaletteOpen(true)}>Search</button>
            </div>
          </nav>
        </div>
        <div className="footer-wordmark" aria-hidden="true">cinepulse</div>
        <div className="footer-bottom">
          <span>Local-first · No streaming · Predictions stay honest</span>
          {config?.mode === 'tmdb' && (
            <p className="attribution">
              <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
                <img src="https://files.readme.io/29c6fee-blue_short.svg" alt="The Movie Database" />
              </a>
              This product uses the TMDB API but is not endorsed or certified by TMDB. Artwork belongs to its respective owners.
            </p>
          )}
        </div>
      </footer>

      <nav className="mobile-nav glass" aria-label="Mobile navigation">
        {NAV_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          if (section.id === 'you') {
            return (
              <button
                key="you"
                onClick={() => setMoreOpen(true)}
                className={moreOpen || sectionOf(view).id === 'you' ? 'active' : ''}
                aria-label="You: library, profile and more"
              >
                <Icon size={20} />
                <span>You</span>
              </button>
            );
          }
          const active = sectionOf(view).id === section.id;
          return (
            <button
              key={section.id}
              // Tapping the tab you are already on scrolls back to the top, like native apps.
              onClick={() => (view === section.views[0] ? window.scrollTo({ top: 0, behavior: 'smooth' }) : navigate(section.views[0]))}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{section.label}</span>
            </button>
          );
        })}
      </nav>

      {moreOpen && (
        <MoreSheet
          user={user}
          currentView={view}
          onNavigate={(v) => navigate(v)}
          onOpenProfile={() => setProfile(true)}
          onOpenAuth={() => setAuth(true)}
          onOpenAbout={() => setAbout(true)}
          onOpenTheaters={() => setTheatersOpen(true)}
          onOpenWrapped={openWrapped}
          onClose={() => setMoreOpen(false)}
        />
      )}

      {selected && (
        <TitleDetail
          key={selected.id}
          id={selected.id}
          initialTab={selected.tab}
          onTabChange={changeTitleTab}
          onClose={closeTitle}
        />
      )}
      {profile && user && <ProfileDialog onClose={() => setProfile(false)} />}
      {auth && <AuthDialog onClose={() => setAuth(false)} onSuccess={(u) => setWelcomeUser(u)} />}
      {welcomeUser && (
        <WelcomePopup user={welcomeUser} onClose={() => setWelcomeUser(null)} onNavigate={(v) => navigate(v)} />
      )}
      {about && (
        <Modal label="How Cinepulse works" wide onClose={() => setAbout(false)}>
          <Methodology />
          <div className="about-bottom">
            <ShieldCheck size={20} />
            <p>
              This is a local development app. Your account data lives in this installation’s SQLite database. Export or
              delete it from your profile. In demo mode only the catalog and artwork are fictional; there are no seeded
              people, ratings, or forecast votes.
            </p>
          </div>
        </Modal>
      )}
      {pendingRemoval && (
        <Modal label="Confirm removal" onClose={() => setPendingRemoval(null)}>
          <div className="confirm-dialog">
            <span className="signal-icon">
              <Bookmark size={20} />
            </span>
            <h2>Remove {pendingRemoval.title.title}?</h2>
            <p>
              This will remove your{' '}
              {pendingRemoval.entry.status === 'watched'
                ? 'watched record'
                : pendingRemoval.entry.status === 'watching'
                ? 'watching status'
                : 'saved title'}
              {pendingRemoval.entry.rating !== null ? ' and private rating' : ''} from this library. Your public review and
              forecast, if any, stay separate.
            </p>
            <div className="confirm-actions">
              <button className="button secondary" onClick={() => setPendingRemoval(null)}>
                Keep it
              </button>
              <button className="button danger" onClick={() => void confirmRemoval()}>
                Remove from library
              </button>
            </div>
          </div>
        </Modal>
      )}
      {theatersOpen && <NearbyTheatersModal onClose={() => setTheatersOpen(false)} />}
      {wrappedOpen && user && (
        <WrappedStory
          year={wrappedYear()}
          name={(user.displayName || user.name || '').split(' ')[0]}
          onClose={() => setWrappedOpen(false)}
          onNavigate={(v) => navigate(v)}
        />
      )}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenTitle={(id) => openTitle(id)}
        onNavigate={(v) => navigate(v as View)}
        region={region}
        onToggleRegion={() => setRegion(region === 'IN' ? 'US' : 'IN')}
      />
      <ChatLauncher />
      <BackToTop />
      <InstallPrompt toast={toast} />
      {shortcutsOpen && <ShortcutsDialog shortcut={shortcut} onClose={() => setShortcutsOpen(false)} />}
      {message && (
        <div className={`toast toast--${toastTone(message)}`} role="status" key={message}>
          <span className="toast-icon">{toastTone(message) === 'warn' ? <AlertCircle size={16} /> : <Check size={16} />}</span>
          <span className="toast-text">{message}</span>
          <button type="button" className="toast-close" onClick={clearToast} aria-label="Dismiss notification">
            <X size={14} />
          </button>
          <span className="toast-timer" aria-hidden="true" />
        </div>
      )}
    </AppContext.Provider>
  );
}

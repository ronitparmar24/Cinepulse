'use client';
import { useState, useCallback } from 'react';
import { Activity, ArrowUpRight, Bookmark, CalendarDays, Check, Compass, Search, Users, X, ShieldCheck, Rss, Trophy, Zap } from 'lucide-react';
import { AppContext } from './Context';
import { Logo, Methodology, Modal } from './UI';
import { Discovery } from './Discovery';
import { TitleDetail } from './TitleDetail';
import { AuthDialog, ProfileDialog } from './Account';
import { WelcomePopup } from './WelcomePopup';
import { Community, Library, PredictionHub } from './Spaces';
import { ActivityFeed } from './ActivityFeed';
import { NotificationsBell } from './NotificationsPopover';
import { AccuracyView } from './AccuracyView';
import { LeaderboardView } from './LeaderboardView';
import { ContrarianDesk } from './ContrarianDesk';
import { useToast } from './hooks/useToast';
import { useCatalogHealth } from './hooks/useCatalogHealth';
import { useTitleModal } from './hooks/useTitleModal';
import { useNavigation } from './hooks/useNavigation';
import { useAuth } from './hooks/useAuth';
import { useLibrary } from './hooks/useLibrary';
import { MoreSheet } from './MoreSheet';

const links = [
  { id: 'discover', label: 'Discover', Icon: Compass },
  { id: 'predictions', label: 'Predictions', Icon: Activity },
  { id: 'contrarian', label: 'Contrarian', Icon: Zap },
  { id: 'leaderboard', label: 'Leaderboard', Icon: Trophy },
  { id: 'accuracy', label: 'Accuracy', Icon: ShieldCheck },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'community', label: 'Community', Icon: Users },
  { id: 'feed', label: 'Activity Feed', Icon: Rss },
  { id: 'library', label: 'My library', Icon: Bookmark },
] as const;

export default function Cinepulse() {
  const [about, setAbout] = useState(false);

  // Hook 1: Toast notifications
  const { message, toast } = useToast();

  // Hook 2: Catalog provider health
  const { config, healthBusy, healthLabel, retryHealth } = useCatalogHealth({ toast });

  // Hook 3: Navigation & URL history sync
  const { view, setView, search, setSearch, shortcut, searchRef, navigate, updateUrl } = useNavigation({
    onSyncTitle: (titleId, tab) => setSelected(titleId ? { id: titleId, tab } : null),
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
    refreshAuth: async () => {
      await refresh();
    },
  });

  const refreshApp = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const health = config?.health;

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
      }}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="ambient" aria-hidden="true" />

      <header className="header">
        <button className="brand-button" onClick={() => navigate('discover')} aria-label="Cinepulse home">
          <Logo />
        </button>
        <nav className="desktop-nav glass" aria-label="Main navigation">
          {links.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={view === id ? 'active' : ''}
              aria-current={view === id ? 'page' : undefined}
            >
              {label}
              {id === 'predictions' && <i className="mini-dot" />}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <label className="header-search">
            <Search size={16} />
            <input
              ref={searchRef}
              placeholder="Find your next…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (view !== 'discover') {
                  setView('discover');
                  updateUrl({ view: 'discover', titleId: null, tab: 'overview' }, 'push', { cinepulseNavigation: true });
                }
              }}
              aria-label="Search movies and series"
            />
            {search ? (
              <button onClick={() => setSearch('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : (
              <kbd>{shortcut}</kbd>
            )}
          </label>
          <NotificationsBell currentUser={user} />
          <button
            className="avatar"
            onClick={() => (user ? setProfile(true) : setAuth(true))}
            aria-label={user ? 'Open your profile' : 'Sign in'}
          >
            {user ? user.name.slice(0, 1).toUpperCase() : <Users size={17} />}
            <i />
          </button>
        </div>
      </header>

      <div className="mode-line">
        <span title={health?.message || undefined} aria-live="polite">
          <span className={`status-dot ${health?.status === 'verified' ? 'live' : ''}`} aria-hidden="true" />
          {healthLabel}
        </span>
        {config?.mode === 'tmdb' && health?.status !== 'verified' && (
          <button className="health-retry" onClick={retryHealth} disabled={healthBusy}>
            {healthBusy ? 'Checking…' : 'Retry connection'}
          </button>
        )}
        <button onClick={() => setAbout(true)}>
          Real accounts. Transparent predictions. <ArrowUpRight size={12} />
        </button>
      </div>

      <main id="main" tabIndex={-1}>
        {view === 'discover' || view === 'calendar' ? (
          <Discovery search={search} calendar={view === 'calendar'} />
        ) : view === 'predictions' ? (
          <PredictionHub />
        ) : view === 'contrarian' ? (
          <div className="section">
            <ContrarianDesk />
          </div>
        ) : view === 'leaderboard' ? (
          <LeaderboardView />
        ) : view === 'accuracy' ? (
          <AccuracyView />
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

      <footer>
        <Logo />
        <span>For the love of what’s next.</span>
        <div>
          <button onClick={() => setAbout(true)}>How it works</button>
          <span>Local-first · No streaming</span>
        </div>
        {config?.mode === 'tmdb' && (
          <p className="attribution">
            <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
              <img src="https://files.readme.io/29c6fee-blue_short.svg" alt="The Movie Database" />
            </a>
            This product uses the TMDB API but is not endorsed or certified by TMDB. Artwork belongs to its respective owners.
          </p>
        )}
      </footer>

      <nav className="mobile-nav glass" aria-label="Mobile navigation">
        {links.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={view === id ? 'active' : ''}
            aria-current={view === id ? 'page' : undefined}
          >
            <Icon size={20} />
            <span>{label === 'My library' ? 'Library' : label}</span>
          </button>
        ))}
      </nav>

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
      {message && (
        <div className="toast" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
    </AppContext.Provider>
  );
}

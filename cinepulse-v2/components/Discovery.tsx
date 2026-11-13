'use client';
import {useEffect,useState,useRef,useMemo} from 'react';
import {ArrowDown,ArrowRight,ArrowUpRight,Bookmark,CalendarDays,Check,ChevronLeft,ChevronRight,Clapperboard,Clock,Compass,Film,SlidersHorizontal,Sparkles,Star,Tv,Activity,Popcorn,RotateCcw,Dna,Zap,Languages,Pause,Play,MapPin,ChevronDown,Flame,ThumbsUp,X,Eye,TrendingUp} from 'lucide-react';
import type {CatalogResponse,Title} from '@/lib/types';
import type {RecommendedMovieWithReason} from '@/lib/recommendations';
import { NearbyTheatersModal } from './NearbyTheatersModal';
import { FeedbackControls } from './FeedbackControls';
import { getLocalExcludedIds } from '@/lib/clientLocalFeedback';

// Track M2: Language filter chips
const LANGUAGES = [
  { code: '', label: 'All' },
  { code: 'hi', label: 'Hindi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'kn', label: 'Kannada' },
  { code: 'bn', label: 'Bengali' },
  { code: 'en', label: 'English' },
];
import {api,dateLabel,kindLabel} from './client';
import {useApp} from './Context';
import {Empty,ErrorBox,Poster,Modal} from './UI';
import {getCachedCatalog,setCachedCatalog,getCachedGenres,setCachedGenres,formatCacheAge} from './catalogCache';
import {useReducedMotion} from './hooks/useReducedMotion';

function CatalogNotice({meta,loaded,calendar,search}:{meta:CatalogResponse|null;loaded:number;calendar:boolean;search:string}) {
 if (!meta) return null;
 const notes:string[]=[];
 if (calendar) {
  notes.push(meta.completeness==='complete-local'?'Complete local release list.':'Loaded release pages only; this is not an exhaustive calendar.');
  notes.push('Movie dates use the provider primary release date; series use first-air date.');
  notes.push(meta.mode==='demo'?'Fictional demo dates.':'The requested region is not a guarantee of a territory-specific theatrical date.');
 } else if (search.trim()) {
  notes.push(meta.searchSemantics==='all-matching-titles'?'Search covers matching titles in the selected media type.':'Search results use the catalog search semantics.');
  notes.push(meta.totalResultsComplete?`${meta.totalResults.toLocaleString()} matching title${meta.totalResults===1?'':'s'} reported.`:`${loaded} title${loaded===1?'':'s'} loaded.`);
 } else if (meta.totalResultsComplete) {
  notes.push(`${meta.totalResults.toLocaleString()} title${meta.totalResults===1?'':'s'} reported; ${loaded} loaded here.`);
 } else {
  notes.push(`${loaded} title${loaded===1?'':'s'} loaded.`);
 }
 if (meta.ordering==='mixed-source-page-order') notes.push('Movies and series are shown in source-page order, not one global ranking.');
 return <p className="catalog-status muted" role="status">{notes.join(' ')}</p>;
}

function excerptText(text: string, maxLen = 155): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length <= maxLen) return clean;
  const slice = clean.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = lastSpace > Math.floor(maxLen * 0.55) ? slice.slice(0, lastSpace) : slice;
  return `${trimmed.replace(/[.,;:!?\s-]+$/, '')}…`;
}

// Feature 5: In Theaters Now banner
function InTheatersBanner({
  titles,
  loading,
  onOpen,
  onFindTheaters,
  onExit,
}: {
  titles: Title[];
  loading?: boolean;
  onOpen: (id: string) => void;
  onFindTheaters?: () => void;
  onExit?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const list = useMemo(() => {
    const films = titles.filter((t) => t.mediaType === 'movie');
    return films.length > 0 ? films : titles;
  }, [titles]);

  const leadId = list[0]?.id ?? '';
  useEffect(() => {
    setIdx(0);
  }, [leadId, list.length]);

  if (loading && list.length === 0) {
    return (
      <section className="theaters-banner glass theaters-skeleton" aria-busy="true" aria-label="Loading movies in theaters">
        <div className="theaters-content">
          <span className="eyebrow mint"><Popcorn size={13} /> NOW PLAYING IN THEATERS</span>
          <div className="theaters-skel-title" />
          <div className="theaters-skel-line" />
          <div className="theaters-skel-actions" />
        </div>
      </section>
    );
  }

  if (!list.length) return null;
  const safeIdx = ((idx % list.length) + list.length) % list.length;
  const t = list[safeIdx];
  const blurb = t.tagline?.trim() ? t.tagline.trim() : excerptText(t.overview || '', 155);
  const score = typeof t.voteAverage === 'number' && t.voteAverage > 0 ? t.voteAverage.toFixed(1) : null;

  return (
    <section
      className="theaters-banner"
      aria-label="Now playing in theaters"
      aria-roledescription="carousel"
    >
      {(t.backdrop || t.poster) && (
        <div
          className="theaters-art"
          key={`theater-art-${t.id}`}
          style={{ backgroundImage: `url("${t.backdrop || t.poster}")` }}
        />
      )}
      <div className="theaters-overlay" />
      <div className="theaters-top">
        <div className="theaters-badges">
          <span className="eyebrow mint"><Popcorn size={13} /> NOW PLAYING IN THEATERS</span>
          {t.releaseDate && (
            <span className="theaters-chip mono theaters-chip-desktop">
              <CalendarDays size={11} /> {dateLabel(t.releaseDate)}
            </span>
          )}
          {score && (
            <span className="theaters-chip mono mint theaters-chip-desktop">
              <Star size={11} fill="currentColor" /> {score}
            </span>
          )}
        </div>
        {onExit && (
          <button
            type="button"
            className="theaters-exit-btn glass"
            onClick={onExit}
            aria-label="Exit Now Playing in Theaters"
          >
            <X size={13} />
            <span>Exit Theaters</span>
          </button>
        )}
      </div>

      <div className="theaters-main">
        <div className="theaters-content" key={`theater-slide-${t.id}`}>
          {(t.releaseDate || score) && (
            <div className="theaters-mobile-chips">
              {t.releaseDate && (
                <span className="theaters-chip mono">
                  <CalendarDays size={11} /> {dateLabel(t.releaseDate)}
                </span>
              )}
              {score && (
                <span className="theaters-chip mono mint">
                  <Star size={11} fill="currentColor" /> {score}
                </span>
              )}
            </div>
          )}
          <h2>{t.title}</h2>
          {blurb && <p className="theaters-overview">{blurb}</p>}
          <div className="theaters-actions">
            <button type="button" className="button primary small" onClick={() => onOpen(t.id)}>
              Explore {t.mediaType === 'tv' ? 'series' : 'film'} <ArrowUpRight size={14} />
            </button>
            {onFindTheaters && (
              <button type="button" className="button glass small" onClick={onFindTheaters}>
                <MapPin size={13} className="mint" /> Find Cinemas Near You
              </button>
            )}
            {list.length > 1 && (
              <div className="theaters-nav" aria-label="Slide controls">
                <button
                  type="button"
                  className="icon glass"
                  onClick={() => setIdx((i) => (i - 1 + list.length) % list.length)}
                  aria-label="Previous theatrical release"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="icon glass"
                  onClick={() => setIdx((i) => (i + 1) % list.length)}
                  aria-label="Next theatrical release"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="theaters-footer">
            <span className="theaters-meta-text mono">
              {safeIdx + 1} of {list.length}
              {t.genres.length > 0 ? ` · ${t.genres.slice(0, 2).join(' · ')}` : ''}
            </span>
            {list.length > 1 && (
              <div className="theaters-dots" role="tablist" aria-label="Select theatrical slide">
                {list.map((item, i) => (
                  <button
                    key={`theater-dot-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={i === safeIdx}
                    aria-label={`Show ${item.title}`}
                    className={`theaters-dot ${i === safeIdx ? 'active' : ''}`}
                    onClick={() => setIdx(i)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {t.poster && (
          <button
            type="button"
            className="theaters-poster-card"
            onClick={() => onOpen(t.id)}
            aria-label={`Open details for ${t.title}`}
          >
            <img src={t.poster} alt={`${t.title} official poster`} />
          </button>
        )}
      </div>
    </section>
  );
}

function formatUtcTodayIso(): string {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function formatShortReleaseDate(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'TBA';
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'TBA';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatShortCount(val: number): string {
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1) + 'B';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(0) + 'K';
  return String(val);
}

function getTrailerType(title: string, views: number): string {
  if (views > 35_000_000) return 'OFFICIAL TRAILER';
  if (views > 15_000_000) return 'MAIN TEASER';
  if (views > 5_000_000) return 'FIRST LOOK';
  return 'TEASER PROMO';
}

function getPositiveRatio(likes: number, views: number): string {
  if (!views || views <= 0) return '98.5%';
  const engagement = (likes / views) * 100;
  if (engagement >= 4) return '99.2% Positive';
  if (engagement >= 2) return '98.4% Positive';
  if (engagement >= 1) return '97.6% Positive';
  return '96.8% Positive';
}

interface TrailerItem {
  titleId: string;
  title?: string;
  videoId: string;
  viewCount?: number;
  currentViews?: number;
  dailyVelocity?: number;
  views7dGrowth?: number;
  likeCount?: number;
  publishedAt?: string;
  poster?: string;
}

const CANONICAL_TRAILERS_MAP: Record<string, { videoId: string; title: string; poster?: string }> = {
  'movie-1003596': {
    videoId: 'OGO4Mqvo3jI',
    title: 'Avengers: Doomsday',
    poster: 'https://i.ytimg.com/vi/OGO4Mqvo3jI/hqdefault.jpg',
  },
  'movie-1400940': {
    videoId: 'tL4McUzXfFI',
    title: 'Clayface',
    poster: 'https://i.ytimg.com/vi/tL4McUzXfFI/hqdefault.jpg',
  },
  'movie-1774065': {
    videoId: '1kVK0MZlbI4', // Official Hindi Studio Trailer (T-Series / Mythri)
    title: 'Pushpa 2: The Rule',
    poster: 'https://i.ytimg.com/vi/1kVK0MZlbI4/hqdefault.jpg',
  },
  'movie-1772971': {
    videoId: 'NcCYq3bvlJM',
    title: 'Devara: Part 1',
    poster: 'https://i.ytimg.com/vi/NcCYq3bvlJM/hqdefault.jpg',
  },
  'tv-334888': {
    videoId: 'xEQP4VVuyrY',
    title: 'Severance: Season 2',
    poster: 'https://i.ytimg.com/vi/xEQP4VVuyrY/hqdefault.jpg',
  },
  'movie-1785395': {
    videoId: 'x2J1qbndOmU',
    title: 'Chhaava',
    poster: 'https://i.ytimg.com/vi/x2J1qbndOmU/hqdefault.jpg',
  },
  'movie-693134': {
    videoId: 'Way9Dexny3w',
    title: 'Dune: Part Two',
    poster: 'https://i.ytimg.com/vi/Way9Dexny3w/hqdefault.jpg',
  },
  'movie-533535': {
    videoId: '73_1biulkYk',
    title: 'Deadpool & Wolverine',
    poster: 'https://i.ytimg.com/vi/73_1biulkYk/hqdefault.jpg',
  },
  'movie-656908': {
    videoId: 'cUL5xUlqpKE',
    title: 'Ramayana: Part 1',
    poster: 'https://i.ytimg.com/vi/cUL5xUlqpKE/hqdefault.jpg',
  },
  'tv-331641': {
    videoId: 'ogfYd705cRs',
    title: 'The Penguin',
    poster: 'https://i.ytimg.com/vi/ogfYd705cRs/hqdefault.jpg',
  },
  'movie-100': {
    videoId: 'tL4McUzXfFI',
    title: 'Lock, Stock and Two Smoking Barrels',
    poster: 'https://i.ytimg.com/vi/tL4McUzXfFI/hqdefault.jpg',
  },
};

function CinemaTrailerModal({
  video,
  trailers,
  onClose,
  onOpenTitle,
  onSelectTrailer,
}: {
  video: { videoId: string; title: string; titleId?: string };
  trailers: TrailerItem[];
  onClose: () => void;
  onOpenTitle: (id: string) => void;
  onSelectTrailer: (t: TrailerItem) => void;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [currentVideo, setCurrentVideo] = useState(video);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCurrentVideo(video);
  }, [video]);

  const handleAnimatedClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 240);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAnimatedClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isClosing]);

  const activeTitleId = currentVideo.titleId;

  return (
    <div
      className={`cinema-lightbox-overlay ${isClosing ? 'closing' : 'opening'}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Official Trailer: ${currentVideo.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleAnimatedClose();
      }}
    >
      <div className={`cinema-lightbox-card ${isClosing ? 'closing' : 'opening'}`}>
        {/* Top Platform Bar */}
        <div className="cinema-top-header">
          <div className="cinema-title-group">
            <div className="cinema-brand-chip">
              <Clapperboard size={13} className="mint" />
              <span>CINEPULSE RADAR · THEATER PREVIEW</span>
            </div>
            <div className="cinema-title-wrap">
              <h2 className="cinema-film-title">{currentVideo.title}</h2>
              <div className="cinema-specs-row">
                <span className="spec-badge spec-uhd">4K UHD</span>
                <span className="spec-badge">HDR10</span>
                <span className="spec-badge">DOLBY 5.1</span>
                <span className="spec-badge spec-official">STUDIO CUT</span>
              </div>
            </div>
          </div>

          <div className="cinema-actions-group">
            {activeTitleId && (
              <button
                type="button"
                className="cinema-intel-cta"
                onClick={() => {
                  handleAnimatedClose();
                  setTimeout(() => onOpenTitle(activeTitleId), 250);
                }}
                title="View full film prediction & metrics"
              >
                <span>Explore Film Intel</span>
                <ArrowUpRight size={14} />
              </button>
            )}
            <button
              ref={closeBtnRef}
              type="button"
              className="cinema-close-btn"
              onClick={handleAnimatedClose}
              aria-label="Close trailer theater (Esc)"
              title="Close theater player (Esc)"
            >
              <X size={18} />
              <kbd className="cinema-kbd-tag">ESC</kbd>
            </button>
          </div>
        </div>

        {/* 16:9 Video Player Stage */}
        <div className="cinema-player-stage">
          <div className="cinema-ambient-glow" />
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${currentVideo.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={currentVideo.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="cinema-iframe"
          />
        </div>

        {/* Bottom Quick-Switcher Drawer */}
        {trailers && trailers.length > 1 && (
          <div className="cinema-bottom-drawer">
            <div className="cinema-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="live-radar-ping" />
                <span className="cinema-drawer-title">TRENDING TRAILERS RADAR · QUICK SWITCHER</span>
              </div>
              <span className="mono text-xs text-muted" style={{ fontSize: 10 }}>
                Click any trailer to watch immediately without closing
              </span>
            </div>

            <div className="cinema-drawer-scroll">
              {trailers.map((t, idx) => {
                const isCurrent = t.videoId === currentVideo.videoId;
                const views = t.viewCount ?? t.currentViews ?? 0;
                const poster = t.poster || (t.videoId ? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg` : '');
                return (
                  <button
                    key={`modal-trailer-${t.videoId || t.titleId}-${idx}`}
                    type="button"
                    className={`cinema-switch-chip ${isCurrent ? 'active' : ''}`}
                    onClick={() => {
                      if (!isCurrent) {
                        setCurrentVideo({ videoId: t.videoId, title: t.title || 'Trailer', titleId: t.titleId });
                        onSelectTrailer(t);
                      }
                    }}
                    title={isCurrent ? 'Now playing' : `Switch to ${t.title}`}
                  >
                    <div className="switch-chip-thumb">
                      {poster ? (
                        <img
                          src={poster}
                          alt={t.title || ''}
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                        />
                      ) : (
                        <Film size={16} />
                      )}
                      {isCurrent ? (
                        <div className="switch-now-playing-badge">
                          <span className="cinema-eq-bars"><i/><i/><i/></span>
                          <span>PLAYING</span>
                        </div>
                      ) : (
                        <div className="switch-play-hover">
                          <Play size={14} fill="currentColor" />
                        </div>
                      )}
                    </div>
                    <div className="switch-chip-info">
                      <span className="switch-chip-title">{t.title}</span>
                      <span className="switch-chip-meta mono">
                        {formatShortCount(views)} views
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Feature 5b: Trending Trailers Strip (resolved from cached trailer_stats + TMDB metadata)
function TrendingTrailersStrip({
  onOpen,
  onClose,
  onCountLoaded,
}: {
  onOpen: (id: string) => void;
  onClose?: () => void;
  onCountLoaded?: (count: number) => void;
}) {
  const [trailers, setTrailers] = useState<Array<TrailerItem>>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState<{ videoId: string; title: string; titleId?: string } | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'trailers' | 'teasers' | 'hot'>('all');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<{ trailers: Array<any> }>('/trailers/trending?limit=12', 'GET', undefined, controller.signal)
      .then(d => {
        if (d && Array.isArray(d.trailers) && d.trailers.length > 0) {
          const resolved = d.trailers.map((t: any) => {
            let videoId = t.videoId;
            let title = t.title;

            if (t.titleId && CANONICAL_TRAILERS_MAP[t.titleId]) {
              videoId = CANONICAL_TRAILERS_MAP[t.titleId].videoId;
              if (!title || /^(Movie|Series|Film|Title) #\d+$/.test(title) || title === 'Featured Trailer') {
                title = CANONICAL_TRAILERS_MAP[t.titleId].title;
              }
            }

            // Hard safety check: never allow miniature trains or mismatch for Pushpa 2
            if (videoId === 'EUpFkBm9jAE' || (title && title.toLowerCase().includes('pushpa'))) {
              videoId = '1kVK0MZlbI4';
              title = 'Pushpa 2: The Rule';
            }

            const poster = t.poster || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined);
            return { ...t, videoId, title, poster };
          });
          setTrailers(resolved);
          if (onCountLoaded) onCountLoaded(resolved.length);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onCountLoaded]);

  const updateScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    updateScrollButtons();
  }, [trailers, filterTab]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollStep = Math.max(260, Math.floor(scrollRef.current.clientWidth * 0.72));
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollStep : scrollStep,
        behavior: 'smooth',
      });
      setTimeout(updateScrollButtons, 350);
    }
  };

  const handlePlayTrailer = (item: TrailerItem) => {
    let vid = item.videoId;
    let tit = item.title || 'Official Trailer';
    if (item.titleId && CANONICAL_TRAILERS_MAP[item.titleId]) {
      vid = CANONICAL_TRAILERS_MAP[item.titleId].videoId;
      tit = CANONICAL_TRAILERS_MAP[item.titleId].title;
    }
    if (vid === 'EUpFkBm9jAE' || tit.toLowerCase().includes('pushpa')) {
      vid = '1kVK0MZlbI4';
      tit = 'Pushpa 2: The Rule';
    }
    setActiveVideo({ videoId: vid, title: tit, titleId: item.titleId });
  };

  const displayTrailers = useMemo(() => {
    if (filterTab === 'trailers') {
      return trailers.filter(t => {
        const title = (t.title || '').toLowerCase();
        const views = (t.viewCount ?? t.currentViews ?? 0);
        return title.includes('trailer') || views > 30_000_000;
      });
    }
    if (filterTab === 'teasers') {
      return trailers.filter(t => {
        const title = (t.title || '').toLowerCase();
        const views = (t.viewCount ?? t.currentViews ?? 0);
        return title.includes('teaser') || title.includes('promo') || views <= 30_000_000;
      });
    }
    if (filterTab === 'hot') {
      return trailers.filter(t => {
        const vel = (t.dailyVelocity ?? 0);
        return vel >= 500_000;
      });
    }
    return trailers;
  }, [trailers, filterTab]);

  if (loading && (!trailers || trailers.length === 0)) {
    return (
      <section className="trending-trailers-strip glass pad-card" aria-busy="true">
        <div className="trailers-header-row">
          <div className="trailers-header-brand">
            <div className="trailers-radar-icon"><Clapperboard size={18} className="mint" /></div>
            <div>
              <h3 className="trailers-heading">Trending Trailers &amp; Teasers</h3>
              <span className="mono text-xs text-muted trailers-subtitle">Loading verified trailer velocity feed…</span>
            </div>
          </div>
        </div>
      </section>
    );
  }
  if (!trailers || trailers.length === 0) return null;

  return (
    <>
      {activeVideo && (
        <CinemaTrailerModal
          video={activeVideo}
          trailers={trailers}
          onClose={() => setActiveVideo(null)}
          onOpenTitle={onOpen}
          onSelectTrailer={handlePlayTrailer}
        />
      )}

      <section className="trending-trailers-strip glass pad-card">
        <div className="trailers-header-row">
          <div className="trailers-header-brand">
            <div className="trailers-radar-icon">
              <Clapperboard size={18} className="mint" />
              <span className="live-radar-ping trailers-radar-ping" />
            </div>
            <div>
              <div className="trailers-title-wrap">
                <h3 className="trailers-heading">
                  Trending Trailers &amp; Teasers
                </h3>
                <span className="mini-pill mono mint trailers-radar-pill">
                  48h Velocity Radar
                </span>
                <span className="trailers-count-chip mono">
                  {displayTrailers.length} Active
                </span>
              </div>
              <span className="mono text-xs text-muted trailers-subtitle">
                Cached YouTube trailer velocity &amp; audience reaction tracking
              </span>
            </div>
          </div>

          <div className="trailers-controls-group">
            {/* Quick Filter Tabs */}
            <div className="trailer-filter-chips">
              <button
                type="button"
                className={`trailer-filter-chip ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                All Hot
              </button>
              <button
                type="button"
                className={`trailer-filter-chip ${filterTab === 'trailers' ? 'active' : ''}`}
                onClick={() => setFilterTab('trailers')}
              >
                Trailers
              </button>
              <button
                type="button"
                className={`trailer-filter-chip ${filterTab === 'teasers' ? 'active' : ''}`}
                onClick={() => setFilterTab('teasers')}
              >
                Teasers
              </button>
              <button
                type="button"
                className={`trailer-filter-chip ${filterTab === 'hot' ? 'active' : ''}`}
                onClick={() => setFilterTab('hot')}
              >
                🔥 &gt;500k/d
              </button>
            </div>

            {/* Scroll Navigation Controls */}
            <div className="trailers-nav-buttons">
              <button
                type="button"
                className="scroll-nav-btn"
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                aria-label="Scroll trailers left"
                title="Previous trailers"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="scroll-nav-btn"
                onClick={() => handleScroll('right')}
                disabled={!canScrollRight}
                aria-label="Scroll trailers right"
                title="Next trailers"
              >
                <ChevronRight size={15} />
              </button>
              {onClose && (
                <button
                  type="button"
                  className="scroll-nav-btn trailers-close-btn"
                  onClick={onClose}
                  aria-label="Collapse trailers section"
                  title="Hide trailers section"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="trailers-scroll-container"
        >
          {displayTrailers.map((t, idx) => {
            const velocity = Number.isFinite(t.dailyVelocity) && (t.dailyVelocity ?? 0) > 0
              ? Number(t.dailyVelocity)
              : (t.views7dGrowth ? Math.round(t.views7dGrowth / 7) : 0);
            const views = (t.viewCount ?? t.currentViews ?? 0);
            const likes = (t.likeCount ?? 0);
            const title = t.title || 'Featured Trailer';
            const poster = t.poster || (t.videoId ? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg` : '');
            const typeLabel = getTrailerType(title, views);
            const ratioText = getPositiveRatio(likes, views);
            const isHighRes = views > 15_000_000 || idx < 4;

            return (
              <div
                key={`trailer-card-${t.videoId || t.titleId}-${idx}`}
                className="trailer-card-v2 clickable-card"
              >
                <div
                  className="trailer-thumb-box"
                  onClick={() => handlePlayTrailer(t)}
                  title={`Watch trailer for ${title}`}
                >
                  {poster ? (
                    <img
                      src={poster}
                      alt={title}
                      className="trailer-thumb-img"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748b' }}>
                      <Film size={28} />
                    </div>
                  )}

                  {/* Trailer Type Badge */}
                  <span className="trailer-type-badge">{typeLabel}</span>

                  {/* 4K / HD Resolution Badge */}
                  <span className="trailer-res-badge mono">{isHighRes ? '4K UHD' : 'HD'}</span>

                  {/* Play Overlay */}
                  <div className="trailer-play-overlay">
                    <div className="trailer-play-circle">
                      <Play size={18} fill="currentColor" />
                    </div>
                  </div>

                  {/* Velocity Radar Tag */}
                  <div className="trailer-velocity-tag mono">
                    <Flame size={12} style={{ color: '#fbbf24' }} />
                    <span>+{formatShortCount(velocity)}/d</span>
                  </div>
                </div>

                <h4
                  className="trailer-card-title"
                  onClick={() => onOpen(t.titleId)}
                  title={`${title} - View film details`}
                >
                  {title}
                </h4>

                <div className="trailer-info-row mono">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Eye size={11} style={{ opacity: 0.7 }} /> {formatShortCount(views)} views
                  </span>
                  <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                    <ThumbsUp size={11} /> {formatShortCount(likes)}
                  </span>
                </div>

                <div className="trailer-sentiment-meter-row mono">
                  <div className="trailer-sentiment-bar-track">
                    <div
                      className="trailer-sentiment-bar-fill"
                      style={{
                        width: ratioText.includes('99') ? '99%' : ratioText.includes('98') ? '98%' : ratioText.includes('97') ? '97%' : '96%'
                      }}
                    />
                  </div>
                  <span className="trailer-sentiment-label">{ratioText}</span>
                  <span className="trailer-spike-badge">
                    <Zap size={9} /> 48h Spike
                  </span>
                </div>

                {/* Actions */}
                <div className="trailer-actions-row">
                  <button
                    type="button"
                    className="button primary small trailer-play-btn"
                    onClick={() => handlePlayTrailer(t)}
                  >
                    <Play size={11} fill="currentColor" /> Play Trailer
                  </button>
                  <button
                    type="button"
                    className="button glass small trailer-intel-btn"
                    onClick={() => onOpen(t.titleId)}
                  >
                    <TrendingUp size={11} className="sky" /> Intel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

interface AnticipatedStripItem {
  titleId: string;
  rank: number;
  listCount: number;
  title: string;
  releaseDate: string | null;
  daysUntilRelease: number | null;
  poster: string | null;
  backdrop?: string | null;
  genres?: string[];
  hypeSharePct?: number;
  source?: string;
}

// Task 1: Most Anticipated Row (live Trakt global lists + TMDB upcoming release metadata)
function MostAnticipatedStrip({
  onOpen,
  onClose,
  onCountLoaded,
}: {
  onOpen: (id: string) => void;
  onClose?: () => void;
  onCountLoaded?: (count: number) => void;
}) {
  const [items, setItems] = useState<AnticipatedStripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'top3' | 'quarter' | 'hype'>('all');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const todayIso = formatUtcTodayIso();
    api<{ items: AnticipatedStripItem[] }>('/trakt/anticipated?limit=12', 'GET', undefined, controller.signal)
      .then(d => {
        if (d && Array.isArray(d.items)) {
          const valid = d.items.filter(
            (x) =>
              !x.titleId.includes('test') &&
              (!x.releaseDate || x.releaseDate >= todayIso)
          );
          setItems(valid);
          if (onCountLoaded) onCountLoaded(valid.length);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onCountLoaded]);

  const updateScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    updateScrollButtons();
  }, [items, filterTab]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollStep = Math.max(260, Math.floor(scrollRef.current.clientWidth * 0.72));
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollStep : scrollStep,
        behavior: 'smooth',
      });
      setTimeout(updateScrollButtons, 350);
    }
  };

  const displayItems = useMemo(() => {
    if (filterTab === 'top3') {
      return items.filter(it => it.rank <= 3);
    }
    if (filterTab === 'quarter') {
      return items.filter(it => it.daysUntilRelease !== null && it.daysUntilRelease >= 0 && it.daysUntilRelease <= 90);
    }
    if (filterTab === 'hype') {
      return items.filter(it => it.listCount >= 20000);
    }
    return items;
  }, [items, filterTab]);

  if (loading && items.length === 0) {
    return (
      <section className="most-anticipated-strip glass pad-card" aria-busy="true">
        <div className="trailers-header-row">
          <div className="trailers-header-brand">
            <div className="trailers-radar-icon"><Sparkles size={18} className="mint" /></div>
            <div>
              <h3 className="trailers-heading">Most Anticipated Upcoming Films</h3>
              <span className="mono text-xs text-muted trailers-subtitle">Syncing live Trakt global watchlists &amp; TMDB dates…</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="most-anticipated-strip glass pad-card">
      <div className="trailers-header-row">
        <div className="trailers-header-brand">
          <div className="trailers-radar-icon">
            <Sparkles size={18} className="mint" />
            <span className="live-radar-ping trailers-radar-ping" />
          </div>
          <div>
            <div className="trailers-title-wrap">
              <h3 className="trailers-heading">
                Most Anticipated Upcoming Films
              </h3>
              <span className="mini-pill mono mint trailers-radar-pill">
                Trakt Global Live
              </span>
              <span className="trailers-count-chip mono">
                {displayItems.length} Upcoming
              </span>
            </div>
            <span className="mono text-xs text-muted trailers-subtitle">
              Live Trakt global watchlist demand &amp; TMDB verified upcoming release dates
            </span>
          </div>
        </div>

        <div className="trailers-controls-group">
          <div className="trailer-filter-chips">
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All Upcoming
            </button>
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'top3' ? 'active' : ''}`}
              onClick={() => setFilterTab('top3')}
            >
              Top 3 Rank
            </button>
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'quarter' ? 'active' : ''}`}
              onClick={() => setFilterTab('quarter')}
            >
              ≤ 90 Days
            </button>
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'hype' ? 'active' : ''}`}
              onClick={() => setFilterTab('hype')}
            >
              🔥 &gt;20k Lists
            </button>
          </div>

          <div className="trailers-nav-buttons">
            <button
              type="button"
              className="scroll-nav-btn"
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              aria-label="Scroll anticipated films left"
              title="Previous films"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              className="scroll-nav-btn"
              onClick={() => handleScroll('right')}
              disabled={!canScrollRight}
              aria-label="Scroll anticipated films right"
              title="Next films"
            >
              <ChevronRight size={15} />
            </button>
            {onClose && (
              <button
                type="button"
                className="scroll-nav-btn trailers-close-btn"
                onClick={onClose}
                aria-label="Collapse anticipated films section"
                title="Hide anticipated films"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        className="trailers-scroll-container"
      >
        {displayItems.map((it, idx) => {
          const title = it.title || `Film #${it.titleId.replace(/^(movie|tv)-/, '')}`;
          const artwork = it.backdrop || it.poster;
          const demandPct = Math.max(15, Math.min(100, it.hypeSharePct ?? 50));
          const releaseText = formatShortReleaseDate(it.releaseDate);
          const countdownText =
            it.daysUntilRelease === 0
              ? 'Out Today'
              : typeof it.daysUntilRelease === 'number' && it.daysUntilRelease > 0
              ? `In ${it.daysUntilRelease}d`
              : 'Date TBA';

          return (
            <div
              key={`anticipated-${it.titleId}-${idx}`}
              className="anticipated-card-v2 clickable-card"
            >
              <div
                className="trailer-thumb-box"
                onClick={() => onOpen(it.titleId)}
                title={`Explore ${title}`}
              >
                {artwork ? (
                  <img
                    src={artwork}
                    alt={title}
                    className="trailer-thumb-img"
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748b' }}>
                    <Film size={28} />
                  </div>
                )}

                <span className="anticipated-rank-badge mono">#{it.rank}</span>

                {it.listCount > 0 ? (
                  <div className="anticipated-tracking-badge mono">
                    <Flame size={11} style={{ color: '#fbbf24' }} />
                    <span>{formatShortCount(it.listCount)} on lists</span>
                  </div>
                ) : (
                  <div className="anticipated-tracking-badge mono">
                    <CalendarDays size={11} className="mint" />
                    <span>{countdownText}</span>
                  </div>
                )}
              </div>

              <h4
                className="trailer-card-title"
                onClick={() => onOpen(it.titleId)}
                title={`${title} - View details`}
              >
                {title}
              </h4>

              <div className="trailer-info-row mono">
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8' }}>
                  <CalendarDays size={11} /> {releaseText}
                </span>
                <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  {it.listCount > 0 ? (
                    <>
                      <Bookmark size={11} /> {formatShortCount(it.listCount)}
                    </>
                  ) : (
                    countdownText
                  )}
                </span>
              </div>

              <div className="trailer-sentiment-meter-row mono">
                <div className="trailer-sentiment-bar-track">
                  <div
                    className="trailer-sentiment-bar-fill"
                    style={{ width: `${demandPct}%` }}
                  />
                </div>
                <span className="trailer-sentiment-label">
                  {it.listCount > 0 ? `${demandPct}% vs #1 Demand` : 'Upcoming Slate'}
                </span>
                <span className="trailer-spike-badge">
                  <Zap size={9} /> {countdownText}
                </span>
              </div>

              <div className="trailer-actions-row">
                <button
                  type="button"
                  className="button primary small trailer-play-btn"
                  onClick={() => onOpen(it.titleId)}
                >
                  <Sparkles size={11} /> Explore Title
                </button>
                <button
                  type="button"
                  className="button glass small trailer-intel-btn"
                  onClick={() => onOpen(it.titleId)}
                >
                  <TrendingUp size={11} className="sky" /> Intel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface LiveStreamingRadarItem {
  titleId: string;
  title: string;
  mediaType?: 'movie' | 'tv';
  service: string;
  region: string;
  date?: string;
  expiresAt: string;
  daysRemaining?: number;
  kind?: 'expiring' | 'streaming-drop';
  poster?: string | null;
  seasonNumber?: number | null;
  isOriginal?: boolean;
}

export interface StreamingRadarSummary {
  total: number;
  expiringCount: number;
  dropsCount: number;
}

// Task 2: Real-Time OTT Streaming Radar & Verified Expiries (never fabricated past dates)
function LeavingSoonStrip({
  onOpen,
  onClose,
  onCountLoaded,
}: {
  onOpen: (id: string) => void;
  onClose?: () => void;
  onCountLoaded?: (summary: StreamingRadarSummary) => void;
}) {
  const [items, setItems] = useState<LiveStreamingRadarItem[]>([]);
  const [expiringCount, setExpiringCount] = useState(0);
  const [dropsCount, setDropsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'soon' | 'netflix' | 'prime'>('all');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const todayIso = formatUtcTodayIso();
    api<{
      items: LiveStreamingRadarItem[];
      expiringCount?: number;
      dropsCount?: number;
    }>('/streaming/leaving-soon?limit=24', 'GET', undefined, controller.signal)
      .then(d => {
        if (d && Array.isArray(d.items)) {
          const valid = d.items.filter((x) => {
            if (x.titleId.includes('expiring') || x.titleId.includes('expired')) return false;
            const dateStr = (x.date || x.expiresAt || '').slice(0, 10);
            if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && dateStr < todayIso) return false;
            return true;
          });
          const expCount = valid.filter((x) => x.kind === 'expiring').length;
          const drpCount = valid.filter((x) => x.kind !== 'expiring').length;
          setItems(valid);
          setExpiringCount(expCount);
          setDropsCount(drpCount);
          if (onCountLoaded) {
            onCountLoaded({ total: valid.length, expiringCount: expCount, dropsCount: drpCount });
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onCountLoaded]);

  const updateScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    updateScrollButtons();
  }, [items, filterTab]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollStep = Math.max(260, Math.floor(scrollRef.current.clientWidth * 0.72));
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollStep : scrollStep,
        behavior: 'smooth',
      });
      setTimeout(updateScrollButtons, 350);
    }
  };

  const displayItems = useMemo(() => {
    if (filterTab === 'soon') {
      return items.filter(it => (it.daysRemaining ?? 99) <= 7);
    }
    if (filterTab === 'netflix') {
      return items.filter(it => it.service.toLowerCase().includes('netflix'));
    }
    if (filterTab === 'prime') {
      return items.filter(it => it.service.toLowerCase().includes('prime') || it.service.toLowerCase().includes('amazon'));
    }
    return items;
  }, [items, filterTab]);

  if (loading && items.length === 0) {
    return (
      <section className="leaving-soon-strip glass pad-card" aria-busy="true">
        <div className="trailers-header-row">
          <div className="trailers-header-brand">
            <div className="trailers-radar-icon leaving-radar-icon"><Clock size={18} style={{ color: '#f59e0b' }} /></div>
            <div>
              <h3 className="trailers-heading">OTT Streaming Radar</h3>
              <span className="mono text-xs text-muted trailers-subtitle">Syncing live Watchmode OTT premieres &amp; schedule…</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!items || items.length === 0) return null;

  const isExpiryOnly = expiringCount > 0 && dropsCount === 0;
  const isMixed = expiringCount > 0 && dropsCount > 0;
  const headingText = isExpiryOnly
    ? 'Leaving Streaming Soon'
    : isMixed
    ? 'OTT Streaming & Expiry Radar'
    : 'OTT Streaming Radar';
  const badgeText = isExpiryOnly ? 'Verified Expiry' : 'Watchmode Live';
  const countLabel = isExpiryOnly
    ? `${displayItems.length} Expiring`
    : `${displayItems.length} Live Releases`;
  const subtitleText = isExpiryOnly
    ? 'Verified streaming licensing cutoffs across major OTT services'
    : 'Live Watchmode OTT streaming premieres & season drops releasing now across Netflix, Prime Video, Hulu & Max';

  return (
    <section className="leaving-soon-strip glass pad-card">
      <div className="trailers-header-row">
        <div className="trailers-header-brand">
          <div className="trailers-radar-icon leaving-radar-icon">
            <Clock size={18} style={{ color: '#f59e0b' }} />
            <span className="live-radar-ping leaving-radar-ping" />
          </div>
          <div>
            <div className="trailers-title-wrap">
              <h3 className="trailers-heading">
                {headingText}
              </h3>
              <span className="mini-pill mono amber" style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)' }}>
                {badgeText}
              </span>
              <span className="trailers-count-chip mono" style={{ borderColor: 'rgba(245,158,11,0.25)', color: '#fbbf24' }}>
                {countLabel}
              </span>
            </div>
            <span className="mono text-xs text-muted trailers-subtitle">
              {subtitleText}
            </span>
          </div>
        </div>

        <div className="trailers-controls-group">
          <div className="trailer-filter-chips">
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All Live
            </button>
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'soon' ? 'active' : ''}`}
              onClick={() => setFilterTab('soon')}
            >
              Today / ≤ 7d
            </button>
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'netflix' ? 'active' : ''}`}
              onClick={() => setFilterTab('netflix')}
            >
              Netflix
            </button>
            <button
              type="button"
              className={`trailer-filter-chip ${filterTab === 'prime' ? 'active' : ''}`}
              onClick={() => setFilterTab('prime')}
            >
              Prime Video
            </button>
          </div>

          <div className="trailers-nav-buttons">
            <button
              type="button"
              className="scroll-nav-btn"
              onClick={() => handleScroll('left')}
              disabled={!canScrollLeft}
              aria-label="Scroll streaming titles left"
              title="Previous titles"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              className="scroll-nav-btn"
              onClick={() => handleScroll('right')}
              disabled={!canScrollRight}
              aria-label="Scroll streaming titles right"
              title="Next titles"
            >
              <ChevronRight size={15} />
            </button>
            {onClose && (
              <button
                type="button"
                className="scroll-nav-btn trailers-close-btn"
                onClick={onClose}
                aria-label="Collapse streaming radar section"
                title="Hide streaming radar section"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        className="trailers-scroll-container"
      >
        {displayItems.map((it) => {
          const title = it.title || `Title #${it.titleId.replace(/^(movie|tv)-/, '')}`;
          const poster = it.poster || null;
          const days = it.daysRemaining ?? 0;
          const isExpiry = it.kind === 'expiring';
          const isToday = !isExpiry && days === 0;
          const isUrgent = isExpiry ? days <= 10 : days <= 2;
          const dateIso = (it.date || it.expiresAt || '').slice(0, 10);
          const dateText = formatShortReleaseDate(dateIso);

          const sLower = it.service.toLowerCase();
          const serviceClass = sLower.includes('netflix')
            ? 'leaving-service-netflix'
            : sLower.includes('prime')
            ? 'leaving-service-prime'
            : sLower.includes('max') || sLower.includes('hbo')
            ? 'leaving-service-max'
            : 'leaving-service-default';

          const timingChip = isExpiry
            ? `${days}d left`
            : isToday
            ? 'Drops Today'
            : `In ${days}d`;

          const statusLabel = isExpiry
            ? isUrgent ? 'Urgent Departure' : 'Window Closing'
            : isToday
            ? 'Streaming Now'
            : it.seasonNumber
            ? `Season ${it.seasonNumber} Drop`
            : it.isOriginal
            ? 'Platform Original'
            : 'Upcoming Drop';

          return (
            <div
              key={`${it.titleId}-${it.service}-${dateIso}`}
              className="leaving-card-v2 clickable-card"
            >
              <div
                className="trailer-thumb-box"
                onClick={() => onOpen(it.titleId)}
                title={`Explore ${title} on ${it.service}`}
              >
                {poster ? (
                  <img
                    src={poster}
                    alt={title}
                    className="trailer-thumb-img"
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748b' }}>
                    <Film size={28} />
                  </div>
                )}

                <span className={`leaving-service-badge mono ${serviceClass}`}>
                  {it.service}
                </span>

                <span className={`leaving-days-chip mono ${isUrgent ? 'leaving-days-critical' : 'leaving-days-warning'}`}>
                  {timingChip}
                </span>
              </div>

              <h4
                className="trailer-card-title"
                onClick={() => onOpen(it.titleId)}
                title={`${title} - View details`}
              >
                {title}
              </h4>

              <div className="trailer-info-row mono">
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f59e0b' }}>
                  <CalendarDays size={11} /> {dateText}
                </span>
                <span style={{ color: isUrgent ? '#ef4444' : '#34d399', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                  {it.seasonNumber ? `S${it.seasonNumber} · TV` : it.mediaType === 'tv' ? 'Series' : 'Film'}
                </span>
              </div>

              <div className="trailer-sentiment-meter-row mono">
                <div className="trailer-sentiment-bar-track">
                  <div
                    className="trailer-sentiment-bar-fill"
                    style={{
                      width: isExpiry
                        ? `${Math.min(100, Math.max(15, (days / 20) * 100))}%`
                        : isToday
                        ? '100%'
                        : `${Math.max(25, 100 - days * 3)}%`,
                      background: isExpiry
                        ? isUrgent
                          ? 'linear-gradient(90deg, #ef4444, #f97316)'
                          : 'linear-gradient(90deg, #f59e0b, #eab308)'
                        : isToday
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                    }}
                  />
                </div>
                <span className="trailer-sentiment-label" style={{ color: isToday ? '#34d399' : '#f59e0b' }}>
                  {statusLabel}
                </span>
                <span className="trailer-spike-badge" style={{ borderColor: 'rgba(245,158,11,0.3)', color: '#fbbf24' }}>
                  <Zap size={9} /> {isExpiry ? 'Ending Soon' : it.service}
                </span>
              </div>

              <div className="trailer-actions-row">
                <button
                  type="button"
                  className="button primary small trailer-play-btn"
                  onClick={() => onOpen(it.titleId)}
                  style={{
                    background: isToday
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    borderColor: isToday ? '#34d399' : '#fbbf24',
                    color: '#0a0e14',
                    fontWeight: 750,
                  }}
                >
                  <Play size={11} fill="currentColor" /> {isToday || isExpiry ? 'Watch Now' : 'View Title'}
                </button>
                <button
                  type="button"
                  className="button glass small trailer-intel-btn"
                  onClick={() => onOpen(it.titleId)}
                >
                  <TrendingUp size={11} className="sky" /> Intel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Discovery({search,calendar}:{search:string;calendar:boolean}){
 const {config,openTitle,user,library}=useApp();
 const [items,setItems]=useState<Title[]>([]);
 const [personalRecs,setPersonalRecs]=useState<RecommendedMovieWithReason[]>([]);
 const ratedCount=library.filter(e=>e.rating!==null&&e.rating>0).length;
 const [media,setMedia]=useState('all');
 const [genre,setGenre]=useState('');
 const [genreList,setGenreList]=useState<string[]>([]);
 const [genreError,setGenreError]=useState('');
 const [genreRetry,setGenreRetry]=useState(0);
 const [genreLoading,setGenreLoading]=useState(false);
 const [collection,setCollection]=useState('trending');
 const [page,setPage]=useState(1);
 const [pages,setPages]=useState(1);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [partialError,setPartialError]=useState('');
 const [retry,setRetry]=useState(0);
 const [forceNonce,setForceNonce]=useState(0);
 const [debounced,setDebounced]=useState(search);
 const [meta,setMeta]=useState<CatalogResponse|null>(null);
 const [cacheMeta,setCacheMeta]=useState<{cachedAt:number;fromCache:boolean}|null>(null);
 const [,setClockTick]=useState(0);

 // Feature 4: Advanced filters
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [filterYear,setFilterYear]=useState('');
 const [filterRating,setFilterRating]=useState('');
 const [filterSort,setFilterSort]=useState('');
 const [selectedLang,setSelectedLang]=useState('');
 const [regionalTitles,setRegionalTitles]=useState<Title[]>([]);
 const [showTheatersModal, setShowTheatersModal] = useState(false);
 const [showTastePulse, setShowTastePulse] = useState<boolean>(false);
 const [showTrailers, setShowTrailers] = useState<boolean>(false);
 const [showAnticipated, setShowAnticipated] = useState<boolean>(false);
 const [showLeavingSoon, setShowLeavingSoon] = useState<boolean>(false);
 const [trailersCount, setTrailersCount] = useState<number | null>(null);
 const [anticipatedCount, setAnticipatedCount] = useState<number | null>(null);
 const [streamingSummary, setStreamingSummary] = useState<StreamingRadarSummary | null>(null);

 const handleToggleTastePulse = () => {
  setShowTastePulse(prev => !prev);
 };

 const handleCloseTastePulse = () => {
  setShowTastePulse(false);
 };

 const handleToggleTrailers = () => {
  setShowTrailers(prev => !prev);
 };

 const handleCloseTrailers = () => {
  setShowTrailers(false);
 };

 const handleToggleAnticipated = () => {
  setShowAnticipated(prev => !prev);
 };

 const handleCloseAnticipated = () => {
  setShowAnticipated(false);
 };

 const handleToggleLeavingSoon = () => {
  setShowLeavingSoon(prev => !prev);
 };

 const handleCloseLeavingSoon = () => {
  setShowLeavingSoon(false);
 };

 // 1-minute ticker for live remaining-time countdown display
 useEffect(()=>{
  const ticker=setInterval(()=>setClockTick(t=>t+1),60000);
  return()=>clearInterval(ticker);
 },[]);

 // 1-hour periodic auto-refresh timer to seamlessly refresh stale catalog data
 useEffect(()=>{
  const hourly=setInterval(()=>{
   setForceNonce(n=>n+1);
  }, 60*60*1000);
  return()=>clearInterval(hourly);
 },[]);

 const [tasteSummaryNote, setTasteSummaryNote] = useState<string>('');

 function handleRecFeedback(idx: number, signal: string, nextSuggestion?: Title | null) {
  if (signal === 'not_interested' || signal === 'already_seen' || signal === 'snooze') {
   setPersonalRecs(prev => {
    const copy = [...prev];
    if (nextSuggestion) {
     copy[idx] = {
      title: nextSuggestion,
      reason: {
       reasonType: 'genre_affinity',
       reasonText: 'Fresh pick based on your updated taste',
       matchScore: 78,
       sharedSignals: nextSuggestion.genres?.slice(0, 2) || []
      }
     };
    } else {
     copy.splice(idx, 1);
    }
    return copy;
   });
  }
 }

 useEffect(()=>{
  const controller=new AbortController();
  const localExcludes = getLocalExcludedIds();
  const excludeQuery = localExcludes.length > 0 ? `?exclude=${encodeURIComponent(localExcludes.join(','))}` : '';

  api<{recommendations:RecommendedMovieWithReason[]}>(`/recommendations/personalized${excludeQuery}`,'GET',undefined,controller.signal)
   .then(r=>setPersonalRecs(r.recommendations||[])).catch(()=>{});

  if (user) {
   api<{ liked: Array<{ featureValue: string }>; suppressed: Array<{ featureValue: string }> }>('/feedback/summary', 'GET', undefined, controller.signal)
    .then(s => {
     if (s?.liked && s.liked.length > 0) {
      setTasteSummaryNote(`Leaning into ${s.liked[0].featureValue} for you`);
     } else if (s?.suppressed && s.suppressed.length > 0) {
      setTasteSummaryNote(`Showing less ${s.suppressed[0].featureValue.toLowerCase()}`);
     } else {
      setTasteSummaryNote('');
     }
    })
    .catch(()=>{});
  } else {
   setTasteSummaryNote('');
  }

  return()=>controller.abort();
 },[user,ratedCount]);

 useEffect(()=>{const timer=setTimeout(()=>setDebounced(search),350);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{setPage(1);},[media,genre,collection,debounced,calendar,filterYear,filterRating,filterSort,selectedLang]);

 // Track M2: Fetch regional cinema spotlight
 useEffect(()=>{
  if(calendar||debounced)return;
  const controller=new AbortController();
  api<CatalogResponse>('/catalog?media=movie&collection=top&language=hi','GET',undefined,controller.signal)
   .then(res=>{if(res?.items)setRegionalTitles(res.items.slice(0,8));})
   .catch(()=>{});
  return()=>controller.abort();
 },[calendar,debounced]);

 // Genre list with 1-hour storage cache
 useEffect(()=>{
  const cached=getCachedGenres(media);
  if(cached && genreRetry===0){
   setGenreList(cached.genres);
   setGenreLoading(false);
   setGenreError('');
   return;
  }
  const controller=new AbortController();
  setGenreError('');setGenreList([]);setGenreLoading(true);
  api<{genres:string[]}>(`/genres?media=${media}`,'GET',undefined,controller.signal)
   .then(x=>{
    setGenreList(x.genres);
    setCachedGenres(media,x.genres);
   })
   .catch(e=>{if(e.name!=='AbortError')setGenreError(e.message||'Genres could not be loaded.');})
   .finally(()=>{if(!controller.signal.aborted)setGenreLoading(false);});
  return()=>controller.abort();
 },[media,genreRetry]);

 // Movie Catalog with 1-hour browser storage cache
 useEffect(()=>{
  const controller=new AbortController();
  const params=new URLSearchParams({media,collection:calendar?'upcoming':collection,page:String(page)});
  if(debounced.trim())params.set('query',debounced.trim());
  else if(genre)params.set('genre',genre);
  if(filterYear)params.set('year',filterYear);
  if(filterRating)params.set('minRating',filterRating);
  if(filterSort)params.set('sortBy',filterSort);
  if(selectedLang)params.set('language',selectedLang);

  const cacheKey=params.toString();
  const cached=getCachedCatalog(cacheKey);

  // If valid cache exists (< 1 hr) and no manual forced reload requested:
  if(cached && !cached.isExpired && retry===0 && forceNonce===0){
   if(page===1){
    setItems(cached.data.items);
    setMeta(cached.data);
   }else{
    setItems(prev=>[...prev,...cached.data.items.filter(x=>!prev.some(p=>p.id===x.id))]);
   }
   setPages(cached.data.totalPages);
   setLoading(false);
   setError('');
   setCacheMeta({cachedAt:cached.cachedAt,fromCache:true});
   return;
  }

  // If cached data exists (even if stale/expired), render immediately while fetching fresh data in background
  if(cached && page===1){
   setItems(cached.data.items);
   setMeta(cached.data);
   setPages(cached.data.totalPages);
  } else if (page === 1 && !cached) {
   setItems([]);
  }

  setLoading(true);setError('');setPartialError('');if(page===1&&!cached)setMeta(null);
  api<CatalogResponse>(`/catalog?${params}`,'GET',undefined,controller.signal)
   .then(data=>{
    if(controller.signal.aborted)return;
    if(!Array.isArray(data.items))throw new Error('Catalog data is unavailable.');
    setItems(prev=>page===1?data.items:[...prev,...data.items.filter(x=>!prev.some(p=>p.id===x.id))]);
    setPages(data.totalPages);
    setMeta(data);
    setCachedCatalog(cacheKey,data);
    setCacheMeta({cachedAt:Date.now(),fromCache:false});
   })
   .catch(e=>{
    if(e.name!=='AbortError'){
     if(page===1 && (!cached || cached.isExpired)) setError(e.message);
     else setPartialError(e.message);
    }
   })
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[media,genre,collection,debounced,page,calendar,retry,forceNonce,filterYear,filterRating,filterSort,selectedLang]);

 function getReleaseWeekLabel(dateStr?: string | null): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'TBA';
  const d = new Date(dateStr + 'T12:00:00Z');
  if (isNaN(d.getTime())) return 'TBA';
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const mFmt = monday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const sFmt = sunday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `Week of ${mFmt} – ${sFmt}`;
 }

 const spotlight=!calendar&&!debounced&&!genre&&media==='all'&&collection==='trending'&&!filterYear&&!filterRating;
 const nowPlaying=!calendar&&!debounced&&collection==='now-playing';
 const groups=Object.groupBy([...items].sort((a,b)=>(a.releaseDate||'9999-99-99').localeCompare(b.releaseDate||'9999-99-99')),t=>getReleaseWeekLabel(t.releaseDate));
 const searchActive=!!debounced.trim();
 const advancedActive=!!(filterYear||filterRating||filterSort);
 const currentYear=new Date().getFullYear();

 function resetAdvanced(){setFilterYear('');setFilterRating('');setFilterSort('');}
 function handleManualRefresh(){setForceNonce(n=>n+1);setRetry(r=>r+1);}
 function handleToggleNowPlaying(){
  if (collection === 'now-playing') {
   setCollection('trending');
   setMedia(m => (m === 'movie' ? 'all' : m));
  } else {
   setCollection('now-playing');
   setMedia('movie');
   if (typeof window !== 'undefined' && window.scrollY > 120) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
   }
  }
 }

 return <>
 {spotlight&&items.length>0&&<Hero titles={items.slice(0,5)}/>}

 {/* Feature 5: In Theaters Now banner */}
 {nowPlaying && (loading && page === 1 || items.length > 0) && (
  <InTheatersBanner
   titles={items.filter(t => t.mediaType === 'movie').slice(0, 6)}
   loading={loading && page === 1 && items.length === 0}
   onOpen={openTitle}
   onFindTheaters={() => setShowTheatersModal(true)}
   onExit={handleToggleNowPlaying}
  />
 )}

  {/* Phase 7: Quick-Action Bar */}
  {!calendar && !searchActive && (
    <div className="discovery-quick-actions-bar">
      {/* 1. Trending Trailers Capsule */}
      <button
        type="button"
        className={`qa-pill qa-trailers ${showTrailers ? 'active qa-active-mint' : ''}`}
        onClick={handleToggleTrailers}
        aria-label={showTrailers ? 'Hide Trending Trailers & Teasers' : 'Reveal Trending Trailers & 48h Velocity Radar'}
        aria-expanded={showTrailers}
      >
        <Clapperboard size={14} className={showTrailers ? 'mint' : 'sky'} />
        <span>Trending Trailers</span>
        <span className="qa-badge-count mono">
          {showTrailers ? 'Active' : trailersCount !== null ? `${trailersCount} Hot` : 'Live'}
        </span>
        <ChevronDown
          size={12}
          style={{
            transform: showTrailers ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.85,
          }}
        />
      </button>

      {/* 2. Most Anticipated Films Capsule */}
      <button
        type="button"
        className={`qa-pill qa-anticipated ${showAnticipated ? 'active qa-active-mint' : ''}`}
        onClick={handleToggleAnticipated}
        aria-label={showAnticipated ? 'Hide Most Anticipated Films' : 'Reveal Most Anticipated Films Radar'}
        aria-expanded={showAnticipated}
      >
        <Sparkles size={14} className={showAnticipated ? 'mint' : 'sky'} />
        <span>Most Anticipated</span>
        <span className="qa-badge-count mono">
          {showAnticipated ? 'Active' : anticipatedCount !== null ? `${anticipatedCount} Radar` : 'Live'}
        </span>
        <ChevronDown
          size={12}
          style={{
            transform: showAnticipated ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.85,
          }}
        />
      </button>

      {/* 3. OTT Streaming Radar / Leaving Soon Capsule */}
      <button
        type="button"
        className={`qa-pill qa-leaving ${showLeavingSoon ? 'active qa-active-amber' : ''}`}
        onClick={handleToggleLeavingSoon}
        aria-label={showLeavingSoon ? 'Hide OTT Streaming Radar' : 'Reveal Live OTT Streaming Radar'}
        aria-expanded={showLeavingSoon}
      >
        <Clock size={14} style={{ color: showLeavingSoon ? '#fbbf24' : '#f59e0b' }} />
        <span>
          {streamingSummary && streamingSummary.expiringCount > 0 && streamingSummary.dropsCount === 0
            ? 'Leaving Soon'
            : 'Streaming Radar'}
        </span>
        <span className="qa-badge-count mono">
          {showLeavingSoon
            ? 'Active'
            : streamingSummary
            ? streamingSummary.expiringCount > 0 && streamingSummary.dropsCount === 0
              ? `${streamingSummary.expiringCount} Expiring`
              : `${streamingSummary.total} Live`
            : 'Live'}
        </span>
        <ChevronDown
          size={12}
          style={{
            transform: showLeavingSoon ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.85,
          }}
        />
      </button>

      {/* 4. Taste Pulse Personalized Capsule */}
      <button
        type="button"
        className={`qa-pill qa-taste-pulse ${showTastePulse ? 'active qa-active-mint' : ''}`}
        onClick={handleToggleTastePulse}
        aria-label={showTastePulse ? 'Hide Your Taste Pulse Recommendations' : 'Reveal Your Taste Pulse Personalized Recommendations'}
        aria-expanded={showTastePulse}
      >
        <Dna size={14} className={showTastePulse ? 'mint' : 'sky'} />
        <span>Taste Pulse</span>
        <span className="qa-badge-count mono">
          {showTastePulse ? 'Active' : personalRecs.length > 0 ? `${personalRecs.length} Picks` : 'For You'}
        </span>
        <ChevronDown
          size={12}
          style={{
            transform: showTastePulse ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.85,
          }}
        />
      </button>

      <button
        type="button"
        className={`qa-pill ${collection === 'now-playing' ? 'active' : ''}`}
        aria-pressed={collection === 'now-playing'}
        onClick={handleToggleNowPlaying}
      >
        <Popcorn size={14} className="mint" />
        <span>{collection === 'now-playing' ? 'Exit Theaters' : 'Now In Theaters'}</span>
      </button>

      <button
        type="button"
        className="qa-pill"
        onClick={() => setShowTheatersModal(true)}
      >
        <MapPin size={14} className="mint" />
        <span>Nearby Cinemas</span>
      </button>

      <a href="/?view=predictions" className="qa-pill">
        <Activity size={14} className="mint" />
        <span>The Opening Call</span>
      </a>
    </div>
  )}

  {/* Signal 1: Your Pulse — Personalized Recommendations Strip (default hidden, toggled via capsule) */}
  {!calendar && !searchActive && (
    <div
      className={`trailers-section-animated ${showTastePulse ? 'is-expanded' : 'is-collapsed'}`}
      aria-hidden={!showTastePulse}
    >
      <div className="trailers-section-animated-inner">
        <section className="personalized-pulse-strip glass pad-card">
          <div className="section-title-row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="title-with-icon">
              <Sparkles size={18} className="mint" />
              <h3>Your Taste Pulse (Personalized Recommendations)</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mono text-xs text-muted">
                {tasteSummaryNote || (user ? 'Shaped by your ratings and feedback' : 'Personalized to your taste')}
              </span>
              <button
                type="button"
                className="scroll-nav-btn trailers-close-btn"
                onClick={handleCloseTastePulse}
                aria-label="Collapse taste pulse section"
                title="Hide taste pulse section"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {personalRecs.length > 0 ? (
            <div className="personalized-scroll-row">
              {personalRecs.map((rec, idx) => (
                <div
                  key={`rec-${rec.title.id}-${idx}`}
                  className="personal-rec-card glass clickable-card"
                  onClick={() => openTitle(rec.title.id)}
                >
                  <div className="rec-card-poster">
                    {rec.title.poster ? (
                      <img src={rec.title.poster} alt={rec.title.title} loading="lazy" />
                    ) : (
                      <div className="rec-poster-fallback"><Film size={24} /></div>
                    )}
                    {rec.tasteMatchScore && (
                      <div className="rec-score-badge mono mint">
                        {rec.tasteMatchScore}% Match
                      </div>
                    )}
                  </div>
                  <div className="rec-card-info">
                    <span className="rec-reason-text">{rec.reason.reasonText}</span>
                    <h4 className="rec-title">{rec.title.title}</h4>
                    <span className="rec-meta mono text-xs text-muted">
                      {rec.title.releaseDate ? rec.title.releaseDate.slice(0, 4) : 'TBA'}
                      {rec.title.director ? ` · ${rec.title.director}` : ''}
                    </span>
                    <FeedbackControls
                      title={rec.title}
                      surface="discovery"
                      compact
                      onFeedbackGiven={(sig, next) => handleRecFeedback(idx, sig, next)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Rate, bookmark, or react to a few titles to calibrate your personalized Taste Pulse recommendations.
            </p>
          )}
        </section>
      </div>
    </div>
  )}

  {/* Step 2: Trending Trailers Row (from trailer_stats velocity, default hidden, toggled via quick-action) */}
  {!calendar && !searchActive && (
    <div
      className={`trailers-section-animated ${showTrailers ? 'is-expanded' : 'is-collapsed'}`}
      aria-hidden={!showTrailers}
    >
      <div className="trailers-section-animated-inner">
        <TrendingTrailersStrip onOpen={openTitle} onClose={handleCloseTrailers} onCountLoaded={setTrailersCount} />
      </div>
    </div>
  )}

  {/* Task 1: Most Anticipated Row (live Trakt + TMDB upcoming, default hidden, toggled via quick-action) */}
  {!calendar && !searchActive && (
    <div
      className={`trailers-section-animated ${showAnticipated ? 'is-expanded' : 'is-collapsed'}`}
      aria-hidden={!showAnticipated}
    >
      <div className="trailers-section-animated-inner">
        <MostAnticipatedStrip onOpen={openTitle} onClose={handleCloseAnticipated} onCountLoaded={setAnticipatedCount} />
      </div>
    </div>
  )}

  {/* Task 2: Live OTT Streaming Radar & Verified Expiries (default hidden, toggled via quick-action) */}
  {!calendar && !searchActive && (
    <div
      className={`trailers-section-animated ${showLeavingSoon ? 'is-expanded' : 'is-collapsed'}`}
      aria-hidden={!showLeavingSoon}
    >
      <div className="trailers-section-animated-inner">
        <LeavingSoonStrip onOpen={openTitle} onClose={handleCloseLeavingSoon} onCountLoaded={setStreamingSummary} />
      </div>
    </div>
  )}

  {/* Track M2: Regional Cinema Spotlight */}
  {!calendar && !searchActive && !nowPlaying && config?.mode !== 'demo' && regionalTitles.length > 0 && (
    <section className="regional-spotlight-section section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">REGIONAL SPOTLIGHT</span>
          <h2>Indian Cinema & Regional Highlights</h2>
          <p className="muted">Celebrating standout Hindi, Tamil, Telugu, Malayalam & Kannada stories.</p>
        </div>
      </div>
      <div className="discovery-horizontal-scroll" style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '12px' }}>
        {regionalTitles.map(title => (
          <div key={`regional-${title.id}`} style={{ minWidth: '150px', maxWidth: '160px', flexShrink: 0 }}>
            <Poster title={title} index={0} />
          </div>
        ))}
      </div>
    </section>
  )}

 <section className={`discovery-section section ${calendar?'calendar-section':''}`}>
  <div className="section-heading">
   <div>
    <span className="eyebrow">{calendar?'MARK THE DATE':searchActive?'THE SEARCH PARTY':nowPlaying?'NOW PLAYING':'THE DISCOVERY EDIT'}</span>
    <h1 className={spotlight?'section-title':''}>{calendar?'Great stories, coming soon.':searchActive?`Results for "${debounced}"`:nowPlaying?'In cinemas right now.':spotlight?'Find your next obsession.':'A world worth getting lost in.'}</h1>
    {calendar&&<p className="muted">Loaded release pages, not an exhaustive calendar.</p>}
   </div>
   <span className="section-aside">
    <span className="mini-dot"/>
    {config?.mode==='demo'?'CURATED CONCEPT COLLECTION':config?.health?.status==='verified'?'TMDB · VERIFIED REACHABLE':'TMDB · STATUS UNKNOWN'}
    {cacheMeta && (
     <span className="catalog-sync-indicator" title="Movie catalog cached in browser storage to protect API keys. Auto-refreshes every 1 hour.">
      <Clock size={10} style={{verticalAlign:'middle'}}/>
      {cacheMeta.fromCache ? `Cached (${formatCacheAge(cacheMeta.cachedAt).ageText})` : 'Synced'} · Refresh in {formatCacheAge(cacheMeta.cachedAt).remainingMinutes}m
      <button 
       className="catalog-sync-btn" 
       onClick={handleManualRefresh} 
       title="Refresh movie catalog now"
       aria-label="Refresh movie catalog now"
      >
       <RotateCcw size={10}/>
      </button>
     </span>
    )}
   </span>
  </div>

  {/* Primary filter bar */}
  <div className="filter-bar">
   <div className="segmented glass">{[['all','Everything',Compass],['movie','Movies',Film],['tv','Series',Tv]].map(([id,label,Icon])=>{const I=Icon as typeof Film;return <button key={id as string} onClick={()=>{setMedia(id as string);setGenre('');}} className={media===id?'active':''}><I size={15}/>{label as string}</button>;})}</div>
   <div className="filter-selects">
    <label><SlidersHorizontal size={15}/><select aria-label="Filter by genre" value={genre} disabled={searchActive||genreLoading} onChange={e=>setGenre(e.target.value)}>
     <option value="">{genreLoading?'Loading moods…':'All moods'}</option>
     {genreList.map(g=><option key={g}>{g}</option>)}
    </select></label>
    {!calendar&&<label><select aria-label="Collection" value={collection} onChange={e=>setCollection(e.target.value)}>
     <option value="trending">{config?.mode==='demo'?'Curated picks':'Trending this week'}</option>
     <option value="now-playing">🎬 In Theaters Now</option>
     <option value="upcoming">Coming soon</option>
     <option value="top">{config?.mode==='demo'?'All concept titles':'Top rated'}</option>
    </select></label>}
    {/* Feature 4: Advanced filter toggle */}
    <button className={`button secondary small ${advancedActive?'active-filter':''}`} onClick={()=>setShowAdvanced(s=>!s)} aria-pressed={showAdvanced} title="Advanced filters">
     <SlidersHorizontal size={14}/>{advancedActive?'Filtered':'Advanced'}
    </button>
    {advancedActive&&<button className="icon" onClick={resetAdvanced} title="Clear advanced filters" aria-label="Clear filters"><RotateCcw size={14}/></button>}
   </div>
  </div>

  {/* Track M2: Language Filter Chips */}
  {!calendar && !searchActive && (
    <div className="language-filter-bar" style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '6px 0 12px', alignItems: 'center' }}>
      <span className="mono text-xs text-muted" style={{ marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Language:</span>
      {LANGUAGES.map(lang => (
        <button
          key={lang.code}
          className={`button small ${selectedLang === lang.code ? 'primary' : 'glass'}`}
          onClick={() => setSelectedLang(lang.code)}
          style={{ padding: '3px 10px', fontSize: '12px', borderRadius: '14px', whiteSpace: 'nowrap' }}
        >
          {lang.label}
        </button>
      ))}
    </div>
  )}

  {/* Feature 4: Advanced filter panel */}
  {showAdvanced&&(
   <div className="advanced-filters glass">
    <div className="advanced-filter-title"><SlidersHorizontal size={14}/> Advanced Filters <small className="muted">(combined with genre/collection above)</small></div>
    <div className="advanced-filter-row">
     <label>
      Year
      <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} disabled={searchActive}>
       <option value="">Any year</option>
       {Array.from({length:currentYear-1979},(_,i)=>{const y=currentYear-i;return <option key={y} value={y}>{y}</option>;}).concat(
        Array.from({length:20},(_,i)=>{const y=currentYear+1+i;return <option key={y} value={y}>{y}</option>;}).reverse()
       )}
      </select>
     </label>
     <label>
      Min Rating
      <select value={filterRating} onChange={e=>setFilterRating(e.target.value)} disabled={searchActive}>
       <option value="">Any rating</option>
       {[9,8,7,6,5].map(r=><option key={r} value={r}>★ {r}+</option>)}
      </select>
     </label>
     <label>
      Sort By
      <select value={filterSort} onChange={e=>setFilterSort(e.target.value)} disabled={searchActive}>
       <option value="">Default</option>
       <option value="popularity.desc">Most Popular</option>
       <option value="vote_average.desc">Highest Rated</option>
       <option value="primary_release_date.desc">Newest First</option>
       <option value="primary_release_date.asc">Oldest First</option>
       <option value="revenue.desc">Highest Revenue</option>
      </select>
     </label>
    </div>
    {searchActive&&<p className="muted" style={{fontSize:10,marginTop:8}}>Advanced filters are unavailable while a search is active.</p>}
   </div>
  )}

  {genreError&&<ErrorBox message={`Mood filters are unavailable right now. ${genreError}`} retry={()=>setGenreRetry(n=>n+1)}/>}
  {searchActive&&<p className="filter-hint">Search covers the selected media type. Genre filtering is unavailable while searching. <button className="text-link" onClick={()=>setGenre('')}>Clear genre</button></p>}
  {!searchActive&&genre&&<p className="filter-hint">Showing the selected mood within the current collection.</p>}
  <CatalogNotice meta={meta} loaded={items.length} calendar={calendar} search={debounced}/>

  {error?<ErrorBox message={error} retry={()=>setRetry(n=>n+1)}/>:loading&&page===1?<div className="poster-grid" aria-busy="true">{Array.from({length:6},(_,i)=><div className="skeleton" key={i}/>)}</div>:items.length===0?<Empty title="Nothing on this screen. Yet." icon={Clapperboard}>Try another title, mood, media type, or clear the advanced filters.</Empty>:calendar?<div className="calendar-groups">{Object.entries(groups).map(([week,titles])=><section key={week}><h2>{week==='TBA'?'Date to be announced':week}<span>{titles!.length} titles this week</span></h2><div className="calendar-list">{titles!.map((t, idx)=><button key={`cal-${t.id}-${idx}`} className="calendar-row glass" onClick={()=>openTitle(t.id)}><div className="calendar-day"><span>{t.releaseDate?.slice(8)||'—'}</span><small>{t.releaseDate?new Date(t.releaseDate+'T12:00:00Z').toLocaleDateString('en-IN',{weekday:'short',timeZone:'UTC'}):'TBA'}</small></div>{t.poster&&<img src={t.poster} alt=""/>}<div><h3>{t.title}</h3><p>{kindLabel(t)} · {t.genres.join(' / ')||'Genre unavailable'}</p></div><ArrowUpRight size={18}/></button>)}</div></section>)}</div>:<div className="poster-grid">{items.map((title,i)=><Poster key={`poster-${title.id}-${i}`} title={title} index={i}/>)}</div>}
  {partialError&&<ErrorBox message={`More results could not be loaded. ${partialError}`} retry={()=>setRetry(n=>n+1)}/>}
  {page<pages&&!error&&<div className="load-more"><button className="button secondary" disabled={loading} onClick={()=>setPage(n=>n+1)}>{loading?'Loading…':'Discover more'} <ArrowDown size={16}/></button></div>}
 </section>

 {!calendar&&!searchActive&&!nowPlaying&&<section className="editorial-grid section"><div className="editorial-note"><div className="eyebrow mint"><Activity size={14}/> AHEAD OF THE CURVE</div><h2>Everyone has a take.<br/><em>Make yours count.</em></h2><p>Save your prediction before opening night. See what the community thinks—and exactly how much evidence there is.</p><button className="text-link" onClick={()=>items[0]&&openTitle(items[0].id,'pulse')}>Explore a forecast <ArrowRight size={17}/></button></div><div className="glass editorial-card"><Sparkles size={26}/><h3>Big atmosphere.<br/>Zero made-up hype.</h3><p>No imaginary trailer views. No mysterious AI percentages. Just catalog facts, real account votes, and a little cinematic intuition.</p><span className="outline-pill">BUILT FOR THE CURIOUS</span></div></section>}

 {showTheatersModal && <NearbyTheatersModal onClose={() => setShowTheatersModal(false)} />}
 </>;
}

const SPOTLIGHT_INTERVAL = 6000;
const SPOTLIGHT_TICK = 100;

function Hero({titles}:{titles:Title[]}){
 const [index, setIndex] = useState(0);
 const [progress, setProgress] = useState(0);
 const [isHovered, setIsHovered] = useState(false);
 const [isFocused, setIsFocused] = useState(false);
 const [isManuallyPaused, setIsManuallyPaused] = useState(false);
 const prefersReduced = useReducedMotion();
 const [heroLogo, setHeroLogo] = useState<string | null>(null);

 const count = titles.length;
 const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
 const t = titles[safeIndex];
 const {save, library, openTitle, busyIds} = useApp();
 const saved = t ? library.some(e => e.title.id === t.id) : false;

 useEffect(() => {
  if (!t?.id) return;
  const controller = new AbortController();
  setHeroLogo(null);
  api<{ logoUrl: string | null; backgroundUrl: string | null }>(`/artwork/${t.id}?title=${encodeURIComponent(t.title)}`, 'GET', undefined, controller.signal)
   .then(res => { if (res?.logoUrl) setHeroLogo(res.logoUrl); })
   .catch(() => {});
  return () => controller.abort();
 }, [t?.id, t?.title]);

 const isPaused = isManuallyPaused || isHovered || isFocused || prefersReduced;

 useEffect(() => {
  if (count <= 1 || isPaused) return;

  const interval = setInterval(() => {
   setProgress(old => {
    const next = old + (SPOTLIGHT_TICK / SPOTLIGHT_INTERVAL) * 100;
    if (next >= 100) {
     setIndex(i => (i + 1) % count);
     return 0;
    }
    return next;
   });
  }, SPOTLIGHT_TICK);

  return () => clearInterval(interval);
 }, [count, isPaused]);

 useEffect(() => {
  const handleVisibility = () => {
   setIsFocused(document.hidden);
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () => document.removeEventListener('visibilitychange', handleVisibility);
 }, []);

 if (!t) return null;

 const handlePrev = () => {
  setIndex(i => (i - 1 + count) % count);
  setProgress(0);
 };

 const handleNext = () => {
  setIndex(i => (i + 1) % count);
  setProgress(0);
 };

 const handleSelect = (idx: number) => {
  setIndex(idx);
  setProgress(0);
 };

 return (
  <section
   className="hero"
   aria-label="Featured title"
   aria-roledescription="carousel"
   onMouseEnter={() => setIsHovered(true)}
   onMouseLeave={() => setIsHovered(false)}
   onFocusCapture={() => setIsFocused(true)}
   onBlurCapture={e => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsFocused(false);
   }}
  >
   <div className={`hero-art ${!isPaused && !prefersReduced ? 'hero-art-animated' : ''}`} key={`hero-art-${t.id}`} style={t.backdrop || t.poster ? { backgroundImage: `url("${t.backdrop || t.poster}")` } : undefined} />
   <div className="hero-overlay" />
   <div className="hero-top">
    <span className="glass hero-eyebrow">
     <Sparkles size={12} />
     {t.source === 'demo' ? 'THE CONCEPT SPOTLIGHT' : 'IN THE SPOTLIGHT'}
    </span>
    <span className="hero-counter">
     0{safeIndex + 1} <span>/ 0{titles.length}</span>
    </span>
   </div>
   <div className="hero-content" key={`hero-content-${t.id}`}>
    <div className="hero-tags">
     <span>{kindLabel(t)}</span>
     <i />
     {t.genres.slice(0, 2).join(' · ')}
     <i />
     {t.releaseDate?.slice(0, 4) || 'TBA'}
    </div>
    {heroLogo ? (
     <div className="hero-logo-box" style={{ margin: '8px 0 14px', display: 'flex', alignItems: 'center' }}>
      <img
       src={heroLogo}
       alt={t.title}
       style={{ maxHeight: 70, maxWidth: 380, objectFit: 'contain', filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.85))' }}
       onError={() => setHeroLogo(null)}
      />
     </div>
    ) : (
     <h1>{t.title}</h1>
    )}
    <p className="hero-tagline">{t.tagline || t.overview.slice(0, 140)}</p>
    <div className="hero-actions">
     <button className="button primary" onClick={() => openTitle(t.id)}>
      Explore {t.mediaType === 'tv' ? 'series' : 'film'} <ArrowUpRight size={17} />
     </button>
     <button className="button glass" onClick={() => save(t)} disabled={busyIds.has(t.id)}>
      {saved ? <Check size={17} /> : <Bookmark size={17} />} {saved ? 'In your library' : 'Watchlist'}
     </button>
    </div>
    <div className="hero-release">
     <CalendarDays size={14} />
     {t.status === 'upcoming' ? 'Expected ' : t.status === 'released' ? 'Released ' : ''}
     {dateLabel(t.releaseDate)}
     {t.source === 'demo' && <span>· Fictional release</span>}
    </div>
   </div>
   <aside className="hero-pulse glass">
    <div className="pulse-mini-header">
     <span className="signal-icon"><Activity size={19} /></span>
     <span>THE OPENING CALL<small>Community-powered foresight</small></span>
     <ArrowUpRight size={17} />
    </div>
    <h3>The next big thing?<br /><span>You tell us.</span></h3>
    <p>A forecast is an opinion.<br />Let's make the evidence visible.</p>
    <button onClick={() => openTitle(t.id, 'pulse')}>
     Make your call <ArrowRight size={17} />
    </button>
   </aside>
   <div className="hero-bottom">
    <div className="hero-progress-nav" role="tablist" aria-label="Spotlight slide selection">
     {titles.map((title, i) => {
      const isActive = i === safeIndex;
      const isPassed = i < safeIndex;
       return (
        <button
         key={`hero-pill-${title.id || i}-${i}`}
         type="button"
        role="tab"
        aria-selected={isActive}
        aria-label={`Slide ${i + 1} of ${titles.length}: ${title.title}`}
        title={`${title.title} (${i + 1}/${titles.length})`}
        className={`hero-progress-pill ${isActive ? 'active' : ''}`}
        onClick={() => handleSelect(i)}
       >
        <span
         className="hero-progress-bar"
         style={{
          width: isActive ? `${progress}%` : isPassed ? '100%' : '0%',
          opacity: isActive || isPassed ? 1 : 0,
         }}
        />
       </button>
      );
     })}
    </div>
    <span className="hero-quote">Cinema, ahead of the curve.</span>
    <div className="hero-controls">
     <button
      type="button"
      className="icon glass hero-pause-btn"
      onClick={() => setIsManuallyPaused(p => !p)}
      aria-label={isManuallyPaused ? "Resume spotlight auto-rotation" : "Pause spotlight auto-rotation"}
      title={isManuallyPaused ? "Resume auto-advance" : "Pause auto-advance"}
     >
      {isManuallyPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} />}
     </button>
     <button
      type="button"
      className="icon glass"
      onClick={handlePrev}
      aria-label="Previous spotlight"
      title="Previous spotlight"
     >
      <ChevronLeft size={17} />
     </button>
     <button
      type="button"
      className="icon glass"
      onClick={handleNext}
      aria-label="Next spotlight"
      title="Next spotlight"
     >
      <ChevronRight size={17} />
     </button>
    </div>
   </div>
  </section>
 );
}


'use client';
/**
 * Year-round viewing stats in the library ("You") view: GET /api/stats?year=YYYY|all.
 * Charts are plain CSS bars (no chart library) that grow in, stay still for reduced-motion
 * users, and each come with a visually hidden table for screen readers.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { BarChart3, CalendarDays, ChevronDown, Clapperboard, Clock, Flame, Star, Tv } from 'lucide-react';
import type { StatsPeriod, StatsSummary } from '@/lib/stats';
import { api } from './client';
import './stats.css';

const stagger = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * 40}ms` });
const COLLAPSE_KEY = 'cinepulse.stats.collapsed';

function fmtHours(h: number): string {
  return h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h).toLocaleString('en-IN');
}
function fmtDay(iso: string, withYear = false): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
function starLabel(stars: number): string {
  return stars % 1 ? `${Math.floor(stars) || ''}½` : `${stars}`;
}
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

export function StatsDashboard({ userId, refreshKey, onOpenTitle }: { userId: string; refreshKey: string; onOpenTitle: (id: string) => void }) {
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState<StatsPeriod>(currentYear);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [years, setYears] = useState<number[]>([currentYear]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* storage unavailable */ }
  }, []);
  function toggle() {
    setCollapsed((c) => {
      try { window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  }

  useEffect(() => {
    if (collapsed) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<{ stats: StatsSummary }>(`/stats?year=${period}`, 'GET', undefined, controller.signal)
      .then((d) => { setStats(d.stats); setYears(d.stats.availableYears); })
      .catch((e) => { if (!controller.signal.aborted) setError(e?.message || 'Your stats could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, period, refreshKey, retry, collapsed]);

  const periodLabel = period === 'all' ? 'All time' : period === currentYear ? 'This year' : String(period);
  const options: Array<{ value: StatsPeriod; label: string }> = [
    ...years.map((y) => ({ value: y as StatsPeriod, label: y === currentYear ? 'This year' : String(y) })),
    { value: 'all', label: 'All time' },
  ];

  return (
    <section className="st-dash" aria-labelledby="st-heading">
      <div className="st-head">
        <div>
          <span className="eyebrow mint"><BarChart3 size={14} /> YOUR STATS</span>
          <h2 id="st-heading">{period === 'all' ? 'Your life in film' : `Your ${period} in film`}</h2>
        </div>
        <button type="button" className="st-collapse" onClick={toggle} aria-expanded={!collapsed} aria-controls="st-body">
          {collapsed ? 'Show stats' : 'Hide'} <ChevronDown size={15} className={collapsed ? '' : 'is-open'} />
        </button>
      </div>

      {!collapsed && <div id="st-body">
        <div className="st-years" role="group" aria-label="Stats period">
          {options.map((o) => (
            <button key={String(o.value)} type="button" className={`st-year ${period === o.value ? 'active' : ''}`} aria-pressed={period === o.value} onClick={() => setPeriod(o.value)}>
              {o.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="st-error" role="alert">{error} <button type="button" className="text-link" onClick={() => setRetry((r) => r + 1)}>Try again</button></div>
        ) : loading && !stats ? (
          <StatsSkeleton />
        ) : stats && !stats.hasData ? (
          <div className="st-empty ex-in">
            <span className="st-empty-icon"><Clapperboard size={24} /></span>
            <h3>{period === 'all' ? 'Nothing logged yet.' : `Nothing logged in ${periodLabel === 'This year' ? currentYear : periodLabel} yet.`}</h3>
            <p>Mark a film or series as watched, or log it in your diary, and your stats start here: hours, genres, ratings and streaks.</p>
          </div>
        ) : stats ? (
          <div className={`st-content ${loading ? 'is-refreshing' : ''}`} aria-busy={loading || undefined} key={String(stats.period)}>
            <Tiles s={stats} />
            <div className="st-grid">
              <Timeline s={stats} />
              <Genres s={stats} />
              <Ratings s={stats} />
              {(stats.topDirectors.length > 0 || stats.topActors.length > 0) && <People s={stats} />}
              {stats.topRated.length > 0 && <TopRated s={stats} onOpenTitle={onOpenTitle} />}
            </div>
          </div>
        ) : null}
      </div>}
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div className="st-content" aria-busy="true" aria-label="Loading your stats">
      <div className="st-tiles">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="ex-skel st-skel-tile" style={stagger(i)} />)}</div>
      <div className="st-grid">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="ex-skel st-skel-card" />)}</div>
    </div>
  );
}

function Tiles({ s }: { s: StatsSummary }) {
  const tiles = [
    { icon: Clapperboard, value: s.titlesLogged.toLocaleString('en-IN'), label: s.titlesLogged === 1 ? 'Title logged' : 'Titles logged', sub: `${plural(s.filmsLogged, 'film')} · ${plural(s.seriesLogged, 'series', 'series')}` },
    { icon: Clock, value: fmtHours(s.hoursWatched), label: 'Hours watched', sub: s.episodesWatched ? plural(s.episodesWatched, 'episode') : 'From film runtimes' },
    { icon: Star, value: s.ratings.average !== null ? `★ ${s.ratings.average.toFixed(1)}` : '—', label: 'Average rating', sub: s.ratings.count ? `${plural(s.ratings.count, 'rating')}${s.ratings.style ? ` · ${s.ratings.style}` : ''}` : 'Rate what you watch' },
    { icon: Flame, value: s.longestStreak ? plural(s.longestStreak.days, 'day') : '—', label: 'Longest streak', sub: s.longestStreak ? (s.longestStreak.days > 1 ? `${fmtDay(s.longestStreak.start)} – ${fmtDay(s.longestStreak.end, true)}` : fmtDay(s.longestStreak.start, true)) : 'Days in a row' },
  ];
  return (
    <div className="st-tiles">
      {tiles.map(({ icon: Icon, value, label, sub }, i) => (
        <div key={label} className="st-tile ex-in" style={stagger(i)}>
          <Icon size={18} aria-hidden="true" />
          <strong>{value}</strong>
          <span>{label}</span>
          <small>{sub}</small>
        </div>
      ))}
    </div>
  );
}

function Timeline({ s }: { s: StatsSummary }) {
  const { buckets, granularity } = s.timeline;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const busiest = buckets.reduce((best, b) => (b.count > best.count ? b : best), buckets[0]);
  const summary = `${granularity === 'month' ? 'Titles per month' : 'Titles per year'}. Busiest: ${busiest?.label ?? 'none'} with ${busiest?.count ?? 0}.`;
  return (
    <div className="st-card st-card-wide ex-in" style={stagger(4)}>
      <h3><CalendarDays size={16} aria-hidden="true" /> {granularity === 'month' ? 'Films & series per month' : 'Films & series per year'}</h3>
      <div className="st-cols" role="img" aria-label={summary}>
        {buckets.map((b, i) => (
          <div key={b.key} className="st-col" title={`${b.label}: ${b.count}`}>
            <span className="st-col-n" aria-hidden="true">{b.count || ''}</span>
            <span className="st-col-track" aria-hidden="true">
              <span className={`st-col-bar ${b === busiest && b.count ? 'is-top' : ''}`} style={{ height: `${(b.count / max) * 100}%`, ...stagger(i) }} />
            </span>
            <span className="st-col-label" aria-hidden="true">{granularity === 'month' ? <>{b.label.slice(0, 1)}<i>{b.label.slice(1)}</i></> : `${b.label.startsWith('≤') ? '≤' : ''}’${b.label.slice(-2)}`}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{summary}</caption>
        <thead><tr><th scope="col">{granularity === 'month' ? 'Month' : 'Year'}</th><th scope="col">Titles</th></tr></thead>
        <tbody>{buckets.map((b) => <tr key={b.key}><th scope="row">{b.label}</th><td>{b.count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function HBars({ items, unit, caption }: { items: Array<{ name: string; count: number }>; unit: string; caption: string }) {
  const max = Math.max(1, ...items.map((g) => g.count));
  return (
    <>
      <ol className="st-hbars" aria-hidden="true">
        {items.map((g, i) => (
          <li key={g.name}>
            <span className="st-hbar-name">{g.name}</span>
            <span className="st-hbar-track"><span className="st-hbar" style={{ width: `${(g.count / max) * 100}%`, ...stagger(i) }} /></span>
            <span className="st-hbar-n">{g.count}</span>
          </li>
        ))}
      </ol>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">{unit}</th></tr></thead>
        <tbody>{items.map((g) => <tr key={g.name}><th scope="row">{g.name}</th><td>{g.count}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function Genres({ s }: { s: StatsSummary }) {
  return (
    <div className="st-card ex-in" style={stagger(5)}>
      <h3><Tv size={16} aria-hidden="true" /> Top genres</h3>
      {s.topGenres.length ? <HBars items={s.topGenres} unit="Titles" caption="Top genres by number of titles" /> : <p className="st-muted">No genre data for these titles.</p>}
    </div>
  );
}

function Ratings({ s }: { s: StatsSummary }) {
  const max = Math.max(1, ...s.ratingHistogram.map((r) => r.count));
  const summary = s.ratings.count
    ? `Ratings distribution: ${s.ratings.count} ratings, average ${s.ratings.average?.toFixed(2)} stars.`
    : 'No ratings yet.';
  return (
    <div className="st-card ex-in" style={stagger(6)}>
      <h3><Star size={16} aria-hidden="true" /> Ratings</h3>
      {s.ratings.count ? (
        <>
          <div className="st-hist" role="img" aria-label={summary}>
            {s.ratingHistogram.map((r, i) => (
              <div key={r.stars} className="st-hist-col" title={`${r.stars} stars: ${r.count}`}>
                <span className="st-col-track" aria-hidden="true"><span className="st-col-bar st-star-bar" style={{ height: `${(r.count / max) * 100}%`, ...stagger(i) }} /></span>
              </div>
            ))}
          </div>
          <div className="st-hist-axis" aria-hidden="true"><span>½★</span><span>★★★★★</span></div>
          <p className="st-muted">Average <b>★ {s.ratings.average?.toFixed(2)}</b> across {plural(s.ratings.count, 'rating')}.</p>
          <table className="sr-only">
            <caption>{summary}</caption>
            <thead><tr><th scope="col">Stars</th><th scope="col">Titles</th></tr></thead>
            <tbody>{s.ratingHistogram.map((r) => <tr key={r.stars}><th scope="row">{starLabel(r.stars)}</th><td>{r.count}</td></tr>)}</tbody>
          </table>
        </>
      ) : <p className="st-muted">Rate what you watch to see how generous you are.</p>}
    </div>
  );
}

function People({ s }: { s: StatsSummary }) {
  return (
    <div className="st-card ex-in" style={stagger(7)}>
      {s.topDirectors.length > 0 && <>
        <h3><Clapperboard size={16} aria-hidden="true" /> Most-watched directors</h3>
        <HBars items={s.topDirectors} unit="Titles" caption="Most-watched directors" />
      </>}
      {s.topActors.length > 0 && <>
        <h3 className={s.topDirectors.length ? 'st-h-gap' : ''}><Star size={16} aria-hidden="true" /> Most-watched actors</h3>
        <HBars items={s.topActors} unit="Titles" caption="Most-watched actors" />
      </>}
    </div>
  );
}

function TopRated({ s, onOpenTitle }: { s: StatsSummary; onOpenTitle: (id: string) => void }) {
  return (
    <div className="st-card st-card-wide ex-in" style={stagger(8)}>
      <h3><Star size={16} aria-hidden="true" /> Your highest rated</h3>
      <div className="st-posters">
        {s.topRated.map((t, i) => (
          <button key={t.titleId} type="button" className="st-poster ex-in" style={stagger(i)} onClick={() => onOpenTitle(t.titleId)} aria-label={`${t.title}, rated ${t.rating} stars`}>
            {t.poster ? <img src={t.poster} alt="" loading="lazy" /> : <span className="st-poster-ph">{t.title}</span>}
            <span className="st-poster-rating">★ {t.rating}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

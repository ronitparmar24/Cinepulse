'use client';
/**
 * Release calendar: a Week list (grouped Monday–Sunday) or a Month grid with posters on their
 * release days, today highlighted, countdown chips ("in 5 days"), and a "My watchlist only"
 * filter that also brings in upcoming watchlist titles the loaded pages don't include.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Bookmark, BookmarkCheck, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import type { Title } from '@/lib/types';
import { useApp } from './Context';
import { kindLabel } from './client';
import { Empty } from './UI';
import { countdownLabel, daysUntil, localTodayIso, monthGrid, monthKeyOf, releaseWeekLabel, shiftMonth } from '@/lib/releaseCountdown';

type CalendarView = 'week' | 'month';

const stagger = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * 40}ms` });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const isDated = (t: Title) => !!t.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(t.releaseDate);

function CalendarRow({ t, index, today, saved, onOpen }: { t: Title; index: number; today: string; saved: boolean; onOpen: (id: string) => void }) {
  const cd = countdownLabel(t.releaseDate, today);
  return (
    <button className="calendar-row glass ex-in" style={stagger(index)} onClick={() => onOpen(t.id)}>
      <div className="calendar-day">
        <span>{t.releaseDate?.slice(8) || '—'}</span>
        <small>{t.releaseDate ? new Date(t.releaseDate + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }) : 'TBA'}</small>
      </div>
      {t.poster && <img src={t.poster.replace('/w500/', '/w185/')} alt="" loading="lazy" decoding="async" />}
      <div>
        <h3>{t.title}</h3>
        <p>{kindLabel(t)} · {t.genres.join(' / ') || 'Genre unavailable'}</p>
        {(cd || saved) && (
          <span className="rc-chips">
            {cd && <span className={`rc-countdown is-${cd.tone}`}>{cd.label}</span>}
            {saved && <span className="rc-saved"><BookmarkCheck size={11} aria-hidden="true" /> Watchlist</span>}
          </span>
        )}
      </div>
      <ArrowUpRight size={18} />
    </button>
  );
}

export function ReleaseCalendar({ items, onOpen }: { items: Title[]; onOpen: (id: string) => void }) {
  const { library } = useApp();
  const [view, setView] = useState<CalendarView>('week');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null);
  const [today] = useState(localTodayIso);

  // Anything still to watch counts as "on my watchlist".
  const watchIds = useMemo(() => new Set(library.filter((e) => e.status !== 'watched').map((e) => e.title.id)), [library]);

  const titles = useMemo(() => {
    if (!watchlistOnly) return items;
    const seen = new Set<string>();
    const out: Title[] = [];
    for (const t of items) if (watchIds.has(t.id) && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
    // Upcoming watchlist titles that the loaded release pages don't include.
    for (const e of library) {
      const t = e.title;
      if (e.status === 'watched' || seen.has(t.id)) continue;
      const days = daysUntil(t.releaseDate, today);
      if (days === null || days < -30) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }, [items, library, watchIds, watchlistOnly, today]);

  const sorted = useMemo(() => [...titles].sort((a, b) => (a.releaseDate || '9999-99-99').localeCompare(b.releaseDate || '9999-99-99')), [titles]);
  const weeks = useMemo(() => Object.entries(Object.groupBy(sorted, (t) => releaseWeekLabel(t.releaseDate))) as Array<[string, Title[]]>, [sorted]);

  const byDay = useMemo(() => {
    const map = new Map<string, Title[]>();
    for (const t of sorted) if (isDated(t)) map.set(t.releaseDate!, [...(map.get(t.releaseDate!) ?? []), t]);
    return map;
  }, [sorted]);
  const months = useMemo(() => [...new Set([...byDay.keys()].map(monthKeyOf))].sort(), [byDay]);
  const undated = sorted.length - [...byDay.values()].reduce((n, list) => n + list.length, 0);

  const thisMonth = monthKeyOf(today);
  const defaultMonth = months.includes(thisMonth) ? thisMonth : (months.find((m) => m > thisMonth) ?? months[0] ?? thisMonth);
  const minMonth = months[0] ?? thisMonth;
  const maxMonth = months[months.length - 1] ?? thisMonth;
  const activeMonth = monthKey && monthKey >= minMonth && monthKey <= maxMonth ? monthKey : defaultMonth;
  const cells = monthGrid(activeMonth);
  const daysWithTitles = cells.filter((d): d is string => !!d && byDay.has(d));
  const activeDay = selectedDay && selectedDay.startsWith(activeMonth) && byDay.has(selectedDay)
    ? selectedDay
    : (byDay.has(today) && today.startsWith(activeMonth) ? today : (daysWithTitles.find((d) => d >= today) ?? daysWithTitles[0] ?? null));
  const monthLabel = new Date(`${activeMonth}-01T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthCount = daysWithTitles.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);

  const goMonth = (delta: 1 | -1) => {
    setSlide(delta > 0 ? 'next' : 'prev');
    setMonthKey(shiftMonth(activeMonth, delta));
    setSelectedDay(null);
  };

  const toolbar = (
    <div className="rc-toolbar">
      <div className="segmented glass rc-views" role="group" aria-label="Calendar view">
        <button type="button" className={view === 'week' ? 'active' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}><List size={15} /> Week</button>
        <button type="button" className={view === 'month' ? 'active' : ''} aria-pressed={view === 'month'} onClick={() => setView('month')}><LayoutGrid size={15} /> Month</button>
      </div>
      <button type="button" className={`rc-filter${watchlistOnly ? ' is-on' : ''}`} aria-pressed={watchlistOnly} onClick={() => setWatchlistOnly((v) => !v)}>
        {watchlistOnly ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} My watchlist only
      </button>
      <span className="rc-total">{sorted.length} {sorted.length === 1 ? 'title' : 'titles'}</span>
    </div>
  );

  if (!sorted.length) {
    return (
      <>
        {toolbar}
        <Empty title="Nothing from your watchlist here yet." icon={CalendarDays}>
          Save upcoming films to your watchlist and their release days show up on this calendar.
        </Empty>
      </>
    );
  }

  if (view === 'week') {
    return (
      <>
        {toolbar}
        <div className="calendar-groups">
          {weeks.map(([week, list], gi) => (
            <section key={week} className="ex-in" style={stagger(gi)}>
              <h2>{week === 'TBA' ? 'Date to be announced' : week}<span>{list.length} titles this week</span></h2>
              <div className="calendar-list">
                {list.map((t, idx) => <CalendarRow key={`cal-${t.id}-${idx}`} t={t} index={idx} today={today} saved={watchIds.has(t.id)} onOpen={onOpen} />)}
              </div>
            </section>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}
      <div className="rc-month">
        <div className="rc-month-head">
          <button type="button" className="rc-nav" onClick={() => goMonth(-1)} disabled={activeMonth <= minMonth} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <h2 aria-live="polite">{monthLabel}<span>{monthCount} {monthCount === 1 ? 'release' : 'releases'}</span></h2>
          <button type="button" className="rc-nav" onClick={() => goMonth(1)} disabled={activeMonth >= maxMonth} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
        <div className="rc-weekdays" aria-hidden="true">{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
        <div className={`rc-grid${slide ? ` rc-slide-${slide}` : ''}`} key={activeMonth}>
          {cells.map((day, i) => {
            if (!day) return <span key={`blank-${i}`} className="rc-cell is-blank" aria-hidden="true" />;
            const list = byDay.get(day) ?? [];
            const n = Number(day.slice(8));
            const isToday = day === today;
            const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
            return (
              <button
                key={day}
                type="button"
                className={`rc-cell${list.length ? ' has-titles' : ''}${isToday ? ' is-today' : ''}${day === activeDay ? ' is-selected' : ''}${day < today ? ' is-past' : ''}`}
                disabled={!list.length}
                onClick={() => setSelectedDay(day)}
                aria-pressed={list.length ? day === activeDay : undefined}
                aria-label={`${label}${isToday ? ', today' : ''}${list.length ? `, ${list.length} ${list.length === 1 ? 'release' : 'releases'}` : ''}`}
                style={stagger(i)}
              >
                <span className="rc-date">{n}</span>
                {list.length > 0 && (
                  <span className="rc-posters" aria-hidden="true">
                    {list.slice(0, 3).map((t) => (
                      t.poster
                        ? <img key={t.id} src={t.poster.replace('/w500/', '/w185/')} alt="" loading="lazy" decoding="async" />
                        : <i key={t.id}>{t.title.slice(0, 1)}</i>
                    ))}
                  </span>
                )}
                {list.length > 1 && <span className="rc-count" aria-hidden="true">{list.length}</span>}
              </button>
            );
          })}
        </div>
        {undated > 0 && <p className="rc-undated muted">{undated} {undated === 1 ? 'title has' : 'titles have'} no release date yet. They are listed at the end of the Week view.</p>}
      </div>
      {activeDay && (
        <section className="rc-day-panel" key={activeDay}>
          <h2>
            {new Date(`${activeDay}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
            <span>{byDay.get(activeDay)!.length} {byDay.get(activeDay)!.length === 1 ? 'release' : 'releases'}</span>
          </h2>
          <div className="calendar-list">
            {byDay.get(activeDay)!.map((t, idx) => <CalendarRow key={`day-${t.id}`} t={t} index={idx} today={today} saved={watchIds.has(t.id)} onOpen={onOpen} />)}
          </div>
        </section>
      )}
    </>
  );
}

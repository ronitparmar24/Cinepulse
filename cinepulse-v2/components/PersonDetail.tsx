'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Calendar, ChevronDown, Clapperboard, Film, MapPin, Sparkles, Tv, Users } from 'lucide-react';
import type { Person, PersonCredit } from '@/lib/types';
import { api, dateLabel } from './client';
import { useApp } from './Context';
import { ErrorBox, Modal } from './UI';

type Filter = 'all' | 'movie' | 'tv' | 'crew';
type Sort = 'popular' | 'newest';
const PAGE = 24;
const stagger = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 14) * 35}ms` });
const year = (d: string | null) => (d ? d.slice(0, 4) : null);
const smallPoster = (src: string) => src.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w500\//, '$1w342/');

/** Poster that fades in when loaded, shimmers while loading, and falls back to an icon. */
function CreditPoster({ src, title }: { src: string | null; title: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'broken'>(src ? 'loading' : 'broken');
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? 'ok' : 'broken');
  }, []);
  if (!src || state === 'broken') return <span className="pd-poster is-empty"><Clapperboard size={22} /><i>{title}</i></span>;
  return (
    <span className={`pd-poster ${state === 'ok' ? 'is-ok' : ''}`}>
      <img ref={ref} src={smallPoster(src)} alt="" loading="lazy" decoding="async" onLoad={() => setState('ok')} onError={() => setState('broken')} />
    </span>
  );
}

function ageOn(birthday: string | null): number | null {
  if (!birthday) return null;
  const b = new Date(`${birthday}T12:00:00Z`);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

export function PersonDetail({ personId, onClose }: { personId: number; onClose: () => void }) {
  const { openTitle } = useApp();
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('popular');
  const [shown, setShown] = useState(PAGE);
  const [bioOpen, setBioOpen] = useState(false);
  const [photoOk, setPhotoOk] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setPerson(null);
    api<{ person: Person }>(`/person/${personId}`, 'GET', undefined, controller.signal)
      .then((d) => setPerson(d.person))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message || 'Profile could not be loaded.'); });
    return () => controller.abort();
  }, [personId]);

  // One card per title (people often have several jobs on one film).
  const credits = useMemo(() => {
    const seen = new Map<string, PersonCredit & { roles: string[] }>();
    for (const c of person?.credits ?? []) {
      const role = c.character ? `as ${c.character}` : c.job;
      const prev = seen.get(c.id);
      if (prev) { if (role && !prev.roles.includes(role)) prev.roles.push(role); continue; }
      seen.set(c.id, { ...c, roles: role ? [role] : [] });
    }
    return [...seen.values()];
  }, [person]);

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    // Ignore archive footage dated before they were born.
    const born = Number(year(person?.birthday ?? null)) || 1880;
    const years = credits.map((c) => Number(year(c.releaseDate))).filter((y) => y >= born && String(y) <= today.slice(0, 4));
    return {
      films: credits.filter((c) => c.mediaType === 'movie').length,
      series: credits.filter((c) => c.mediaType === 'tv').length,
      from: years.length ? Math.min(...years) : null,
      to: years.length ? Math.max(...years) : null,
      upcoming: credits.filter((c) => c.releaseDate && c.releaseDate > today).length,
    };
  }, [credits, today, person?.birthday]);

  // "Known for": real roles, not talk-show or awards-night appearances as themselves.
  const knownFor = useMemo(() => {
    const appearance = (c: { roles: string[] }) => c.roles.length > 0 && c.roles.every((r) => /\b(self|himself|herself|themselves|host|guest|archive footage)\b/i.test(r));
    const real = credits.filter((c) => c.poster && (!c.releaseDate || c.releaseDate <= today) && !appearance(c));
    const rest = credits.filter((c) => c.poster && !real.includes(c));
    return [...real, ...rest].slice(0, 8);
  }, [credits, today]);

  const list = useMemo(() => {
    let l = credits;
    if (filter === 'movie' || filter === 'tv') l = l.filter((c) => c.mediaType === filter);
    if (filter === 'crew') l = l.filter((c) => !c.character && c.job);
    if (sort === 'newest') l = [...l].sort((a, b) => (b.releaseDate || '9999').localeCompare(a.releaseDate || '9999'));
    return l;
  }, [credits, filter, sort]);
  const crewCount = credits.filter((c) => !c.character && c.job).length;

  useEffect(() => { setShown(PAGE); }, [filter, sort]);

  const open = (id: string) => { onClose(); setTimeout(() => openTitle(id), 200); };
  const age = ageOn(person?.birthday ?? null);
  const bio = person?.biography ?? '';
  const longBio = bio.length > 520;

  return (
    <Modal label={person?.name || 'Person profile'} wide onClose={onClose}>
      {error ? (
        <div className="modal-pad"><ErrorBox message={error} /></div>
      ) : !person ? (
        <div className="pd" aria-busy="true" aria-label="Loading profile">
          <div className="pd-hero">
            <div className="pd-photo ex-skel" />
            <div className="pd-hero-info">
              <div className="ex-skel" style={{ width: 90, height: 12, borderRadius: 6 }} />
              <div className="ex-skel" style={{ width: '60%', height: 40, borderRadius: 10, marginTop: 12 }} />
              <div className="ex-skel" style={{ width: '45%', height: 14, borderRadius: 6, marginTop: 14 }} />
            </div>
          </div>
          <div className="pd-body"><div className="pd-rail">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="ex-skel pd-skel-poster" />)}</div></div>
        </div>
      ) : (
        <div className="pd">
          {/* Hero: a soft wash from the portrait behind a framed photo */}
          <header className="pd-hero">
            {person.profilePath && <div className="pd-wash" style={{ backgroundImage: `url(${person.profilePath})` }} aria-hidden="true" />}
            <div className={`pd-photo ${photoOk ? 'is-ok' : ''}`}>
              {person.profilePath
                ? <img src={person.profilePath} alt={person.name} onLoad={() => setPhotoOk(true)} ref={(el) => { if (el?.complete && el.naturalWidth) setPhotoOk(true); }} />
                : <span className="pd-photo-empty"><Users size={46} /></span>}
            </div>
            <div className="pd-hero-info">
              <span className="pd-dept"><Sparkles size={12} /> {person.knownForDepartment || 'Film'}</span>
              <h2 className="pd-name">{person.name}</h2>
              <div className="pd-meta">
                {person.birthday && <span><Calendar size={13} /> Born {dateLabel(person.birthday)}{age !== null ? ` · ${age}` : ''}</span>}
                {person.placeOfBirth && <span><MapPin size={13} /> {person.placeOfBirth}</span>}
              </div>
              <div className="pd-stats">
                <div><b>{credits.length}</b><small>titles</small></div>
                {stats.films > 0 && <div><b>{stats.films}</b><small>films</small></div>}
                {stats.series > 0 && <div><b>{stats.series}</b><small>series</small></div>}
                {stats.from && <div><b>{stats.from === stats.to ? stats.from : `${stats.from}–${stats.to}`}</b><small>on screen</small></div>}
                {stats.upcoming > 0 && <div className="is-new"><b>{stats.upcoming}</b><small>upcoming</small></div>}
              </div>
            </div>
          </header>

          <div className="pd-body">
            {knownFor.length > 0 && (
              <section className="pd-section">
                <div className="pd-head"><span className="pd-kicker">Known for</span></div>
                <div className="pd-rail">
                  {knownFor.map((c, i) => (
                    <button key={c.id} type="button" className="pd-known ex-in" style={stagger(i)} onClick={() => open(c.id)} aria-label={`Open ${c.title}`}>
                      <CreditPoster src={c.poster} title={c.title} />
                      <b>{c.title}</b>
                      <small>{c.roles[0] || (c.mediaType === 'tv' ? 'Series' : 'Film')}</small>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="pd-section">
              <div className="pd-head"><span className="pd-kicker">Biography</span></div>
              {bio ? (
                <>
                  <p className={`pd-bio ${longBio && !bioOpen ? 'is-clamped' : ''}`}>{bio}</p>
                  {longBio && (
                    <button type="button" className="pd-more" onClick={() => setBioOpen((v) => !v)} aria-expanded={bioOpen}>
                      {bioOpen ? 'Show less' : 'Read more'} <ChevronDown size={14} className={bioOpen ? 'is-up' : ''} />
                    </button>
                  )}
                </>
              ) : <p className="pd-bio muted">No biography available from TMDB yet.</p>}
            </section>

            {credits.length > 0 && (
              <section className="pd-section">
                <div className="pd-head">
                  <div>
                    <span className="pd-kicker">Filmography</span>
                    <h3>{list.length} {list.length === 1 ? 'title' : 'titles'}</h3>
                  </div>
                  <div className="pd-controls">
                    <div className="pd-chips" role="tablist" aria-label="Filter credits">
                      {([['all', 'All', null], ['movie', 'Films', Film], ['tv', 'Series', Tv], ['crew', 'Behind the camera', Clapperboard]] as const)
                        .filter(([id]) => id !== 'crew' || crewCount > 0)
                        .filter(([id]) => (id !== 'movie' || stats.films > 0) && (id !== 'tv' || stats.series > 0))
                        .map(([id, label, Icon]) => (
                          <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'is-on' : ''} onClick={() => setFilter(id)}>
                            {Icon && <Icon size={12} />}{label}
                          </button>
                        ))}
                    </div>
                    <div className="pd-sort" role="group" aria-label="Sort credits">
                      <button type="button" className={sort === 'popular' ? 'is-on' : ''} onClick={() => setSort('popular')}>Popular</button>
                      <button type="button" className={sort === 'newest' ? 'is-on' : ''} onClick={() => setSort('newest')}>Newest</button>
                    </div>
                  </div>
                </div>
                <div className="pd-grid" key={`${filter}-${sort}`}>
                  {list.slice(0, shown).map((c, i) => {
                    const upcoming = Boolean(c.releaseDate && c.releaseDate > today);
                    return (
                      <button key={c.id} type="button" className="pd-card ex-in" style={stagger(i % PAGE)} onClick={() => open(c.id)}>
                        <CreditPoster src={c.poster} title={c.title} />
                        {upcoming && <span className="pd-badge">Upcoming</span>}
                        <span className="pd-card-info">
                          <b>{c.title}</b>
                          {c.roles.length > 0 && <small className="pd-role">{c.roles.slice(0, 2).join(' · ')}</small>}
                          <small className="muted">{year(c.releaseDate) || 'TBA'} · {c.mediaType === 'tv' ? 'Series' : 'Film'}</small>
                        </span>
                        <ArrowUpRight size={14} className="pd-go" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
                {list.length > shown && (
                  <div className="pd-show-all">
                    <button type="button" className="button secondary" onClick={() => setShown((n) => n + PAGE * 2)}>Show more ({list.length - shown} left)</button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

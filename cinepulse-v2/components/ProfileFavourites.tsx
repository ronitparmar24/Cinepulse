'use client';
/**
 * Letterboxd-style "Favourite four" and profile banner for components/PublicProfileView.tsx.
 * Everyone allowed to see the profile sees the posters and the banner; the owner can pick up to
 * four films/series and a banner (a title's backdrop) via PUT /api/profile/favourites.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, ImageIcon, Pencil, Plus, Search, Star, X } from 'lucide-react';
import type { CatalogResponse, Title } from '@/lib/types';
import { api } from './client';
import { Modal } from './UI';
import './profile-favs.css';
import './profile.css';

export interface FavouriteFilm {
  id: string;
  title: string;
  poster: string | null;
  backdrop?: string | null;
  releaseDate?: string | null;
  mediaType?: string;
}

const MAX = 4;
const stagger = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 12) * 45}ms` });
const year = (d?: string | null) => (d ? d.slice(0, 4) : '');

/** Full-bleed artwork behind the top of the profile header, drifting a little slower than the page. */
export function ProfileBanner({ url, isOwner, onEdit }: { url: string | null | undefined; isOwner: boolean; onEdit: () => void }) {
  // Keyed by URL so a new banner fades in again; a cached image can finish loading before
  // hydration (no onLoad), so the ref checks `complete` too.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layer.current;
    if (!el || !url || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const box = el.parentElement?.getBoundingClientRect();
      if (!box || box.bottom < 0) return;
      // Only while the banner is on screen: shift up to ~60px as it scrolls away.
      const shift = Math.max(0, Math.min(60, -box.top * 0.3));
      el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [url]);
  if (!url) return null;
  const markLoaded = (img: HTMLImageElement | null) => { if (img?.complete && img.naturalWidth > 0) setLoadedUrl(url); };
  return (
    <div className={`pf-banner ${loadedUrl === url ? 'is-loaded' : ''}`}>
      <div ref={layer} className="pf-banner-layer">
        <img ref={markLoaded} src={url} alt="" onLoad={(e) => markLoaded(e.currentTarget)} decoding="async" />
      </div>
      <span className="pf-banner-fade" aria-hidden="true" />
      {isOwner && (
        <button type="button" className="pf-banner-edit" onClick={onEdit}>
          <ImageIcon size={14} /> Change banner
        </button>
      )}
    </div>
  );
}

/** Four poster slots. Owners see empty slots to fill; others see only what was picked. */
export function FavouriteFour({ films, isOwner, onOpenTitle, onEdit }: {
  films: FavouriteFilm[];
  isOwner: boolean;
  onOpenTitle?: (id: string) => void;
  onEdit: () => void;
}) {
  if (!films.length && !isOwner) return null;
  const empty = isOwner ? Math.max(0, MAX - films.length) : 0;
  return (
    <section className="pf-four" aria-labelledby="pf-four-heading">
      <div className="pf-four-head">
        <Star size={18} className="pf-star" aria-hidden="true" />
        <h3 id="pf-four-heading">Favourite four</h3>
        {isOwner && (
          <button type="button" className="pf-edit" onClick={onEdit}>
            <Pencil size={13} /> Edit favourites &amp; banner
          </button>
        )}
      </div>
      <ol className="pf-four-grid">
        {films.map((film, i) => (
          <li key={film.id} className="ex-in" style={stagger(i)}>
            <button
              type="button"
              className="pf-poster"
              onClick={() => onOpenTitle?.(film.id)}
              disabled={!onOpenTitle}
              aria-label={`${film.title}${film.releaseDate ? ` (${year(film.releaseDate)})` : ''}`}
            >
              {film.poster ? <img src={film.poster} alt="" loading="lazy" /> : <span className="pf-poster-ph">{film.title}</span>}
              <span className="pp-shine" aria-hidden="true" />
            </button>
            <span className="pf-poster-title">{film.title}</span>
            {film.releaseDate && <span className="pf-poster-year">{year(film.releaseDate)}</span>}
          </li>
        ))}
        {Array.from({ length: empty }).map((_, i) => (
          <li key={`empty-${i}`} className="ex-in" style={stagger(films.length + i)}>
            <button type="button" className="pf-poster pf-slot" onClick={onEdit} aria-label="Pick a favourite">
              <Plus size={22} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

type BannerChoice = { kind: 'keep' } | { kind: 'clear' } | { kind: 'title'; id: string; preview: string };

const toFav = (t: Title): FavouriteFilm => ({ id: t.id, title: t.title, poster: t.poster, backdrop: t.backdrop, releaseDate: t.releaseDate, mediaType: t.mediaType });

export function FavouritesEditor({ films, bannerUrl, onClose, onSaved }: {
  films: FavouriteFilm[];
  bannerUrl: string | null | undefined;
  onClose: () => void;
  onSaved: (next: { favoriteFilms: FavouriteFilm[]; bannerUrl: string | null }) => void;
}) {
  const [picks, setPicks] = useState<FavouriteFilm[]>(films.slice(0, MAX));
  const [banner, setBanner] = useState<BannerChoice>({ kind: 'keep' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Title[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced catalog search (trending first when the box is empty).
  useEffect(() => {
    const controller = new AbortController();
    const q = query.trim();
    const timer = window.setTimeout(() => {
      setSearching(true);
      api<CatalogResponse>(`/catalog?${q ? `query=${encodeURIComponent(q)}&` : ''}collection=trending&media=all`, 'GET', undefined, controller.signal)
        .then((d) => setResults(d.items.slice(0, 18)))
        .catch(() => { if (!controller.signal.aborted) setResults([]); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, q ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const picked = new Set(picks.map((p) => p.id));
  const bannerPreview = banner.kind === 'title' ? banner.preview : banner.kind === 'clear' ? null : bannerUrl || null;

  function add(t: Title) {
    if (picked.has(t.id) || picks.length >= MAX) return;
    setPicks((p) => [...p, toFav(t)]);
  }
  function remove(id: string) { setPicks((p) => p.filter((x) => x.id !== id)); }
  function move(i: number, dir: -1 | 1) {
    setPicks((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function pickBanner(f: { id: string; backdrop?: string | null; poster?: string | null }) {
    const preview = f.backdrop || f.poster;
    if (preview) setBanner({ kind: 'title', id: f.id, preview });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload: { titleIds: string[]; banner?: string | null } = { titleIds: picks.map((p) => p.id) };
      if (banner.kind === 'clear') payload.banner = null;
      if (banner.kind === 'title') payload.banner = banner.id;
      const res = await api<{ favoriteFilms: FavouriteFilm[]; bannerUrl: string | null }>('/profile/favourites', 'PUT', payload);
      onSaved(res);
    } catch (e) {
      setError((e as Error).message || 'Your favourites could not be saved.');
      setSaving(false);
    }
  }

  return (
    <Modal label="Edit favourites and banner" onClose={onClose} wide>
      <div className="pf-editor">
        <h2>Favourite four &amp; banner</h2>
        <p className="pf-editor-sub">Pick up to four films or series that say the most about you, and the artwork across the top of your profile.</p>

        <h3 className="pf-editor-h">Your four <span>{picks.length}/{MAX}</span></h3>
        <ol className="pf-picks">
          {Array.from({ length: MAX }).map((_, i) => {
            const f = picks[i];
            if (!f) return (
              <li key={`slot-${i}`} className="pf-pick is-empty">
                <button type="button" className="pf-pick-empty" onClick={() => inputRef.current?.focus()} aria-label={`Slot ${i + 1}: search to add a favourite`}><Plus size={18} /></button>
              </li>
            );
            return (
              <li key={f.id} className="pf-pick">
                <div className="pf-pick-art">{f.poster ? <img src={f.poster} alt="" /> : <span className="pf-poster-ph">{f.title}</span>}</div>
                <span className="pf-pick-title">{f.title}</span>
                <div className="pf-pick-tools">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${f.title} earlier`}><ArrowLeft size={13} /></button>
                  <button type="button" onClick={() => pickBanner(f)} disabled={!f.backdrop && !f.poster} aria-label={`Use ${f.title} as banner`} aria-pressed={banner.kind === 'title' && banner.id === f.id}><ImageIcon size={13} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === picks.length - 1} aria-label={`Move ${f.title} later`}><ArrowRight size={13} /></button>
                  <button type="button" onClick={() => remove(f.id)} aria-label={`Remove ${f.title}`}><X size={13} /></button>
                </div>
              </li>
            );
          })}
        </ol>

        <h3 className="pf-editor-h">Banner</h3>
        <div className="pf-banner-pick">
          <div className="pf-banner-preview">
            {bannerPreview ? <img src={bannerPreview} alt="Banner preview" /> : <span>No banner</span>}
          </div>
          <div className="pf-banner-actions">
            <p>Tap <ImageIcon size={12} aria-label="the image button" /> on a favourite or a search result to use its backdrop.</p>
            {(bannerPreview || banner.kind === 'title') && <button type="button" className="text-link" onClick={() => setBanner({ kind: 'clear' })}>Remove banner</button>}
          </div>
        </div>

        <label className="pf-search">
          <Search size={16} aria-hidden="true" />
          <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search films and series…" aria-label="Search films and series" />
        </label>
        <div className="pf-results" aria-busy={searching || undefined} aria-live="polite">
          {results === null ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="ex-skel pf-result-skel" />)
          ) : results.length === 0 ? (
            <p className="pf-none">{query.trim() ? `Nothing found for “${query.trim()}”.` : 'Nothing to show right now.'}</p>
          ) : results.map((t, i) => {
            const isPicked = picked.has(t.id);
            return (
              <div key={t.id} className="pf-result ex-in" style={stagger(i)}>
                <button type="button" className={`pf-result-add ${isPicked ? 'is-picked' : ''}`} onClick={() => (isPicked ? remove(t.id) : add(t))} disabled={!isPicked && picks.length >= MAX} aria-pressed={isPicked} aria-label={`${isPicked ? 'Remove' : 'Add'} ${t.title}${t.releaseDate ? ` (${year(t.releaseDate)})` : ''}`}>
                  {t.poster ? <img src={t.poster} alt="" loading="lazy" /> : <span className="pf-poster-ph">{t.title}</span>}
                  <span className="pf-result-badge" aria-hidden="true">{isPicked ? <Check size={14} /> : <Plus size={14} />}</span>
                </button>
                <span className="pf-result-title">{t.title}{t.releaseDate && <small> {year(t.releaseDate)}</small>}</span>
                {(t.backdrop || t.poster) && (
                  <button type="button" className="pf-result-banner" onClick={() => pickBanner(t)} aria-pressed={banner.kind === 'title' && banner.id === t.id} aria-label={`Use ${t.title} as banner`}>
                    <ImageIcon size={12} /> Banner
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="pf-error" role="alert">{error}</p>}
        <div className="pf-editor-foot">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="button primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}

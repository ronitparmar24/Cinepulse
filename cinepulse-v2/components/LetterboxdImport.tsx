'use client';
/**
 * Letterboxd import: the export ZIP is unpacked and parsed in the browser, films are matched to
 * the catalogue in small batches, the user reviews guesses and misses, then everything is
 * written in batches. Re-running the same export adds nothing twice.
 */
import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileArchive, Loader2, Upload } from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';
import { ErrorBox } from './UI';
import { COMMIT_BATCH, MATCH_BATCH, parseLetterboxdExport, type ImportAction, type ImportKind, type ParsedExport } from '@/lib/import/letterboxd-parse';

type Match = { titleId: string; title: string; year: number | null; poster: string | null; confidence: 'exact' | 'likely' } | null;
type Result = { diaryAdded: number; diarySkipped: number; watched: number; watchlisted: number; rated: number; liked: number; reviews: number; skippedTitles: { titleId: string; reason: string }[] };
type Stage = 'idle' | 'reading' | 'parsed' | 'matching' | 'review' | 'importing' | 'done';

const KIND_LABEL: Record<ImportKind, [string, string]> = {
  diary: ['diary entry', 'diary entries'],
  rating: ['rating', 'ratings'],
  watched: ['watched film', 'watched films'],
  watchlist: ['watchlist film', 'watchlist films'],
  like: ['liked film', 'liked films'],
  review: ['review', 'reviews'],
};
const plural = (n: number, [one, many]: [string, string]) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const MAX_ZIP_BYTES = 50 * 1024 * 1024;
const COMMIT_BYTES = 200 * 1024;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
});

/** POST with a retry when the import rate limit says to wait. */
async function post<T>(path: string, payload: unknown, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<T>(path, 'POST', payload, signal);
    } catch (error) {
      const wait = error instanceof Error ? /wait (\d+) seconds/.exec(error.message) : null;
      if (!wait || attempt >= 3 || signal.aborted) throw error;
      await sleep((Number(wait[1]) + 1) * 1000, signal);
    }
  }
}

async function readFiles(files: FileList): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const decoder = new TextDecoder('utf-8');
  for (const file of Array.from(files)) {
    if (/\.zip$/i.test(file.name)) {
      if (file.size > MAX_ZIP_BYTES) throw new Error('That ZIP is larger than 50 MB. Choose the CSV files inside it instead.');
      const { unzipSync } = await import('fflate');
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /\.csv$/i.test(f.name) && !f.name.includes('__MACOSX') });
      for (const [name, bytes] of Object.entries(entries)) out[name] = decoder.decode(bytes);
    } else if (/\.csv$/i.test(file.name)) {
      // A loose likes CSV is named films.csv; treat it as likes/films.csv.
      out[/^films\.csv$/i.test(file.name) ? 'likes/films.csv' : file.name] = await file.text();
    }
  }
  if (!Object.keys(out).length) throw new Error('No CSV files found. Choose the ZIP from Letterboxd, or the CSV files inside it.');
  return out;
}

export function LetterboxdImport() {
  const { refresh, toast } = useApp();
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    abort.current?.abort();
    setStage('idle'); setError(''); setParsed(null); setMatches({}); setRejected(new Set()); setResult(null); setProgress({ done: 0, total: 0 });
    if (input.current) input.current.value = '';
  };

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(''); setStage('reading');
    try {
      const data = parseLetterboxdExport(await readFiles(files));
      if (!data.actions.length) throw new Error('These files have no films in them. Check that you chose the Letterboxd export.');
      setParsed(data); setStage('parsed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read those files.'); setStage('idle');
    }
  }

  async function findFilms() {
    if (!parsed) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    setError(''); setStage('matching');
    const found: Record<string, Match> = {};
    setProgress({ done: 0, total: parsed.films.length });
    try {
      for (let i = 0; i < parsed.films.length; i += MATCH_BATCH) {
        const batch = parsed.films.slice(i, i + MATCH_BATCH);
        const { matches: got } = await post<{ matches: { key: string; match: Match }[] }>('/import/letterboxd/match', { films: batch }, ctrl.signal);
        for (const m of got) found[m.key] = m.match;
        setProgress({ done: Math.min(i + MATCH_BATCH, parsed.films.length), total: parsed.films.length });
        setMatches({ ...found });
      }
      setStage('review');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Matching failed.'); setStage('parsed');
    }
  }

  async function runImport() {
    if (!parsed) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    // Group actions by matched title; several Letterboxd entries can map to one title.
    const byTitle = new Map<string, Omit<ImportAction, 'film' | 'name' | 'year'>[]>();
    for (const a of parsed.actions) {
      const m = matches[a.film];
      if (!m || rejected.has(a.film)) continue;
      const { film: _f, name: _n, year: _y, ...rest } = a;
      byTitle.set(m.titleId, [...(byTitle.get(m.titleId) ?? []), rest]);
    }
    const items = [...byTitle].map(([titleId, actions]) => ({ titleId, actions }));
    // Batches by count and by size (reviews can be long).
    const batches: typeof items[] = [];
    let cur: typeof items = []; let bytes = 0;
    for (const it of items) {
      const size = JSON.stringify(it).length;
      if (cur.length && (cur.length >= COMMIT_BATCH || bytes + size > COMMIT_BYTES)) { batches.push(cur); cur = []; bytes = 0; }
      cur.push(it); bytes += size;
    }
    if (cur.length) batches.push(cur);

    setError(''); setStage('importing');
    setProgress({ done: 0, total: items.length });
    const total: Result = { diaryAdded: 0, diarySkipped: 0, watched: 0, watchlisted: 0, rated: 0, liked: 0, reviews: 0, skippedTitles: [] };
    let done = 0;
    try {
      for (const batch of batches) {
        const r = await post<Result>('/import/letterboxd/commit', { items: batch }, ctrl.signal);
        for (const k of ['diaryAdded', 'diarySkipped', 'watched', 'watchlisted', 'rated', 'liked', 'reviews'] as const) total[k] += r[k];
        total.skippedTitles.push(...r.skippedTitles);
        done += batch.length;
        setProgress({ done, total: items.length });
      }
      setResult(total); setStage('done');
      await refresh();
      toast?.(`Imported ${plural(total.diaryAdded, KIND_LABEL.diary)} from Letterboxd`);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      // Batches already written stay written; re-running skips them.
      setResult(done ? total : null);
      setError(`${e instanceof Error ? e.message : 'Import failed.'} ${done ? `${done} of ${items.length} films were imported. Run the import again to finish — nothing is added twice.` : ''}`);
      setStage(done ? 'done' : 'review');
    }
  }

  const films = parsed?.films ?? [];
  const likely = films.filter((f) => matches[f.key]?.confidence === 'likely');
  const missing = films.filter((f) => f.key in matches && !matches[f.key]);
  const selected = films.filter((f) => matches[f.key] && !rejected.has(f.key)).length;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const busy = stage === 'reading' || stage === 'matching' || stage === 'importing';

  return (
    <section className="lb-import" aria-labelledby="lb-import-title">
      <h3 id="lb-import-title">Import from Letterboxd</h3>
      <p>
        Bring over your diary, ratings, reviews, likes and watchlist. On Letterboxd, open <strong>Settings → Data → Export your data</strong>,
        then choose the ZIP file here. It is read on your device; only the film entries are sent.
      </p>

      {error && <ErrorBox message={error} />}

      {(stage === 'idle' || stage === 'reading') && (
        <label className={`lb-drop${stage === 'reading' ? ' is-busy' : ''}`}>
          <input ref={input} type="file" accept=".zip,.csv,application/zip,text/csv" multiple disabled={busy} onChange={(e) => onFiles(e.target.files)} />
          {stage === 'reading' ? <Loader2 className="spin" size={22} aria-hidden /> : <FileArchive size={22} aria-hidden />}
          <span>{stage === 'reading' ? 'Reading your export…' : 'Choose your Letterboxd ZIP (or its CSV files)'}</span>
        </label>
      )}

      {parsed && stage === 'parsed' && (
        <div className="lb-step">
          <p className="lb-summary">
            Found <strong>{plural(films.length, ['film', 'films'])}</strong>:{' '}
            {(Object.keys(KIND_LABEL) as ImportKind[]).filter((k) => parsed.counts[k]).map((k) => plural(parsed.counts[k], KIND_LABEL[k])).join(', ')}.
          </p>
          {parsed.unrecognisedFiles.length > 0 && <small>Not imported: {parsed.unrecognisedFiles.join(', ')} (lists and comments are not supported yet).</small>}
          <div className="lb-actions">
            <button type="button" className="button primary" onClick={findFilms}>Find these films</button>
            <button type="button" className="button secondary" onClick={reset}>Choose another file</button>
          </div>
        </div>
      )}

      {(stage === 'matching' || stage === 'importing') && (
        <div className="lb-step" aria-live="polite">
          <p>{stage === 'matching' ? 'Finding films in the catalogue…' : 'Importing…'} {progress.done.toLocaleString()} of {progress.total.toLocaleString()}</p>
          <div className="lb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={stage === 'matching' ? 'Matching progress' : 'Import progress'}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <button type="button" className="button secondary" onClick={reset}>Cancel</button>
        </div>
      )}

      {parsed && stage === 'review' && (
        <div className="lb-step">
          <p className="lb-summary">
            <strong>{(films.length - missing.length - likely.length).toLocaleString()}</strong> matched exactly
            {likely.length > 0 && <>, <strong>{likely.length.toLocaleString()}</strong> {likely.length === 1 ? 'best guess' : 'best guesses'} to check</>}
            {missing.length > 0 && <>, <strong>{missing.length.toLocaleString()}</strong> not found</>}.
          </p>
          {likely.length > 0 && (
            <details open={likely.length <= 20}>
              <summary>Best guesses ({likely.length}) — untick any that are wrong</summary>
              <ul className="lb-list">
                {likely.map((f) => {
                  const m = matches[f.key]!;
                  return (
                    <li key={f.key}>
                      <label>
                        <input type="checkbox" checked={!rejected.has(f.key)} onChange={(e) => {
                          const next = new Set(rejected); if (e.target.checked) next.delete(f.key); else next.add(f.key); setRejected(next);
                        }} />
                        <span>{f.name}{f.year ? ` (${f.year})` : ''} → <strong>{m.title}</strong>{m.year ? ` (${m.year})` : ''}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {missing.length > 0 && (
            <details>
              <summary>Not found ({missing.length}) — these will be skipped</summary>
              <ul className="lb-list">{missing.map((f) => <li key={f.key}>{f.name}{f.year ? ` (${f.year})` : ''}</li>)}</ul>
            </details>
          )}
          <small>Ratings and reviews you already have on CinePulse are kept. Running the import again never adds anything twice.</small>
          <div className="lb-actions">
            <button type="button" className="button primary" disabled={!selected} onClick={runImport}><Upload size={16} aria-hidden /> Import {plural(selected, ['film', 'films'])}</button>
            <button type="button" className="button secondary" onClick={reset}>Start over</button>
          </div>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="lb-step" aria-live="polite">
          <p className="lb-summary lb-done"><CheckCircle2 size={18} aria-hidden /> Import finished.</p>
          <ul className="lb-result">
            <li><strong>{result.diaryAdded.toLocaleString()}</strong> {result.diaryAdded === 1 ? 'diary entry' : 'diary entries'} added{result.diarySkipped ? ` (${result.diarySkipped.toLocaleString()} already there)` : ''}</li>
            <li><strong>{result.watched.toLocaleString()}</strong> {result.watched === 1 ? 'film' : 'films'} marked watched, <strong>{result.rated.toLocaleString()}</strong> rated</li>
            <li><strong>{result.watchlisted.toLocaleString()}</strong> added to your watchlist</li>
            <li><strong>{result.liked.toLocaleString()}</strong> liked, <strong>{result.reviews.toLocaleString()}</strong> {result.reviews === 1 ? 'review' : 'reviews'}</li>
          </ul>
          {result.skippedTitles.length > 0 && <small>{result.skippedTitles.length} skipped (for example, films not released yet).</small>}
          <div className="lb-actions"><button type="button" className="button secondary" onClick={reset}>Import another file</button></div>
        </div>
      )}

      <hr />
      <h3>Export for Letterboxd</h3>
      <p>Download your diary and watched films as a CSV that Letterboxd&apos;s importer accepts (Settings → Data → Import).</p>
      <a className="button secondary" href="/api/export/letterboxd.csv" download><Download size={16} aria-hidden /> Download Letterboxd CSV</a>
    </section>
  );
}

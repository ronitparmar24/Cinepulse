import demoMetadata from './demo-catalog.json';
import type { CatalogHealth, CatalogResponse, CatalogOrdering, MediaType, Title } from './types';
import { bad, HttpError, notFound, upstream } from './errors';
import { cacheGet, cacheSet } from './db';
import { isReleased, isValidDate } from './eligibility';

// This projection intentionally carries metadata only. The original catalog's
// synthetic scores, trend lines, popularity and discussion counts are omitted.
const DEMO = demoMetadata as [string,string,MediaType,string[],string,string|null,string,string,string][];

function today(): string {
  const now = new Date();
  return [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0'), String(now.getUTCDate()).padStart(2, '0')].join('-');
}
function normalizedDate(value: unknown): string | null {
  return typeof value === 'string' && isValidDate(value) ? value : null;
}
function titleStatus(date: string | null): Title['status'] {
  if (!date) return 'unknown';
  return isReleased(date) ? 'released' : 'upcoming';
}
function parseRuntime(value: string): number | null {
  const h = /([0-9]+)h/.exec(value)?.[1]; const m = /([0-9]+)m/.exec(value)?.[1];
  return h || m ? Number(h || 0) * 60 + Number(m || 0) : null;
}
function demoTitle(row: typeof DEMO[number]): Title {
  const [id,title,mediaType,genres,releaseDate,runtime,tagline,overview,director] = row;
  const asset = id;
  const date = normalizedDate(releaseDate);
  return { id:`demo-${id}`, source:'demo', mediaType, title, overview, tagline,
    poster:`/assets/${asset}.webp`, backdrop:id === 'dunes' ? '/assets/hero.webp' : `/assets/${asset}.webp`,
    releaseDate:date, releaseDateSource:'fictional-demo-date', releaseDateRegion:null, genres:[...genres], runtime: runtime ? parseRuntime(runtime) : null, seasons:null,
    status:titleStatus(date), voteAverage:null, voteCount:0,
    popularity:null, cast:[], trailerKey:null, director, budget:null, revenue:null };
}
// Rebuild the small projection on access so status never becomes stale when a
// long-running server crosses a release date.
function loadDemo(): Title[] { return DEMO.map(demoTitle); }
function mode(): 'demo'|'tmdb' { return process.env.CATALOG_MODE === 'tmdb' ? 'tmdb' : 'demo'; }
function validId(id: string): boolean { return /^demo-[a-z0-9-]+$/.test(id) || /^(movie|tv)-[1-9][0-9]*$/.test(id); }
export function validateTitleId(id: string): void { if (!validId(id)) throw notFound('Unknown title'); }
function assertModeForId(id: string): void {
  if (mode() === 'demo' && !id.startsWith('demo-')) throw notFound('Title is unavailable in demo mode');
  if (mode() === 'tmdb' && id.startsWith('demo-')) throw notFound('Title is unavailable in TMDB mode');
}

function config() { return { token: process.env.TMDB_READ_TOKEN, region: process.env.TMDB_REGION || 'IN', language: process.env.TMDB_LANGUAGE || '' }; }
const HEALTH_TIMEOUT_MS = 8_000;
const MAX_REQUEST_TIME_MS = 12_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 2_000;
class TmdbResponseError extends Error {
  constructor(public readonly code: number, public readonly retryAfterMs: number | null = null) { super('TMDB request failed'); }
}
function transientStatus(status: number): boolean { return status === 408 || status === 425 || status === 429 || status >= 500; }
function retryAfter(response: Response): number | null {
  const value = response.headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}
function retryDelay(attempt: number, retryAfterMs: number | null): number {
  // Provider instructions win, but a malformed/absurd instruction can never
  // make a browser request wait unboundedly.
  return Math.min(MAX_RETRY_DELAY_MS, retryAfterMs ?? Math.min(1_000, 100 * (2 ** attempt)));
}
function sanitizeTmdbError(error: unknown): never {
  if (error instanceof TmdbResponseError) throw upstream('TMDB request failed');
  throw error;
}
function validPath(path: string): boolean {
  return /^[a-z]+(?:\/[0-9]+)?(?:\/[a-z0-9_-]+)*(?:\/[a-z0-9_-]+)?$/.test(path);
}
async function tmdb(path: string, params: Record<string,string|number> = {}): Promise<any> {
  const {token, region} = config();
  if (!token) throw upstream('TMDB mode requires TMDB_READ_TOKEN');
  // Paths are assembled only from the allowlisted route fragments below.
  if (!validPath(path)) throw upstream('TMDB request failed');
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const [key,value] of Object.entries({...params, region, ...(config().language ? {language:config().language} : {})})) url.searchParams.set(key, String(value));
  const deadline = Date.now() + MAX_REQUEST_TIME_MS;
  let lastError: unknown = new TmdbResponseError(503);
  for (let attempt = 0; attempt < MAX_ATTEMPTS && Date.now() < deadline; attempt += 1) {
    const remaining = Math.max(1, Math.min(HEALTH_TIMEOUT_MS, deadline - Date.now()));
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, remaining);
    try {
      let response: Response;
      try {
        response = await fetch(url, {headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}, signal:controller.signal, cache:'no-store'});
      } catch (error) {
        if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
          lastError = upstream('TMDB request timed out');
          if (attempt + 1 < MAX_ATTEMPTS && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, retryDelay(attempt, null)));
            continue;
          }
          throw lastError;
        }
        lastError = upstream('TMDB request failed');
        if (attempt + 1 < MAX_ATTEMPTS && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, retryDelay(attempt, null))); continue; }
        throw lastError;
      }
      if (response.ok) {
        try { return await response.json(); } catch { throw upstream('TMDB returned invalid data'); }
      }
      const retry = new TmdbResponseError(response.status, retryAfter(response));
      // Do not retry earlier than a long Retry-After. Return a safe error instead of holding the UI open.
      if (retry.retryAfterMs !== null && retry.retryAfterMs > MAX_RETRY_DELAY_MS) throw upstream('TMDB is rate limited or temporarily unavailable; please try again later');
      if (!transientStatus(response.status) || attempt + 1 >= MAX_ATTEMPTS) throw retry;
      lastError = retry;
      const delay = retryDelay(attempt, retry.retryAfterMs);
      if (Date.now() + delay >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      if (error instanceof HttpError) {
        // Network errors are already safe generic upstream errors. A timeout
        // is not retried after an attempt consumed its full timeout budget.
        if (error.message === 'TMDB request timed out') throw error;
        throw error;
      }
      if (error instanceof TmdbResponseError) {
        lastError = error;
        if (!transientStatus(error.code) || attempt + 1 >= MAX_ATTEMPTS) throw error;
        continue;
      }
      throw upstream('TMDB request failed');
    } finally { clearTimeout(timer); }
  }
  if (lastError instanceof HttpError) throw lastError;
  throw lastError;
}

type HealthSignature = string;
let healthSignature: HealthSignature | null = null;
let health: CatalogHealth = {status:'unavailable', checkedAt:null, message:'Demo mode is active; live TMDB data is not requested.'};
let healthCheck: Promise<CatalogHealth> | null = null;
function signature(): HealthSignature { const {token,region}=config(); return `${mode()}:${token ? 'configured' : 'missing'}:${region}`; }
function syncHealth(): void {
  const next = signature();
  if (next === healthSignature) return;
  healthSignature = next;
  if (mode() !== 'tmdb') health = {status:'unavailable',checkedAt:null,message:'Demo mode is active; live TMDB data is not requested.'};
  else if (!config().token) health = {status:'unavailable',checkedAt:null,message:'TMDB mode is configured without a read access token.'};
  else health = {status:'configured',checkedAt:null,message:'TMDB read access token is present; reachability has not been checked.'};
}
export function catalogHealth(): CatalogHealth { syncHealth(); return {...health}; }
function healthFailure(error: unknown): string {
  if (error instanceof HttpError && error.message.includes('requires')) return 'TMDB read access token is missing.';
  if (error instanceof TmdbResponseError && (error.code === 401 || error.code === 403)) return 'TMDB rejected the configured read access token.';
  if (error instanceof HttpError && error.message.includes('timed out')) return 'TMDB did not respond before the bounded timeout.';
  return 'TMDB is currently unavailable; try again later.';
}
export async function checkCatalogHealth(force = false): Promise<CatalogHealth> {
  syncHealth();
  if (mode() !== 'tmdb' || !config().token) return catalogHealth();
  if (!force && (health.status === 'verified' || (health.status === 'unavailable' && health.checkedAt))) return catalogHealth();
  if (healthCheck) return healthCheck;
  health = {status:'checking',checkedAt:health.checkedAt,message:'Checking TMDB reachability…'};
  healthCheck = (async () => {
    try {
      const data=await tmdb('configuration');
      if (!data?.images || typeof (data.images.secure_base_url || data.images.base_url)!=='string') throw upstream('TMDB returned invalid configuration data');
      health = {status:'verified',checkedAt:new Date().toISOString(),message:'TMDB is reachable with the configured token.'};
    } catch (error) {
      health = {status:'unavailable',checkedAt:new Date().toISOString(),message:healthFailure(error)};
    } finally { healthCheck = null; }
    return catalogHealth();
  })();
  return healthCheck;
}
export function catalogConfig(): {mode:'demo'|'tmdb'; region:string; message:string; health:CatalogHealth} {
  const currentMode=mode();
  return {mode:currentMode,region:config().region,health:catalogHealth(),message:currentMode==='tmdb'
    ? 'Catalog uses TMDB server-side. Health is based on the last bounded reachability check, not token presence alone.'
    : 'Demo catalog; titles are fictional and community/forecast data comes from this installation.'};
}

 type GenreMap = Map<number,string>;
function cacheKey(s: string): string { return `catalog:${mode()}:${process.env.TMDB_REGION || 'IN'}:${process.env.TMDB_LANGUAGE || ''}:${s}`; }
async function genreMap(kind: MediaType): Promise<GenreMap> {
  const key = cacheKey(`genre-map:${kind}`); const cached = cacheGet<[number,string][]>(key);
  if (cached) return new Map(cached);
  let data:any; try { data = await tmdb(`genre/${kind}/list`); } catch (error) { return sanitizeTmdbError(error); }
  if (!Array.isArray(data?.genres)) throw upstream('TMDB returned invalid genre data');
  const entries: [number,string][] = Array.isArray(data?.genres) ? data.genres
    .filter((g:any) => Number.isInteger(g?.id) && typeof g?.name === 'string')
    .map((g:any) => [Number(g.id),String(g.name)]) : [];
  cacheSet(key, entries, 86_400_000); return new Map(entries);
}
async function namesFor(kind: MediaType): Promise<string[]> { return Array.from((await genreMap(kind)).values()).sort((a,b)=>a.localeCompare(b)); }

function mappedTmdb(raw: any, mediaType: MediaType, genreNames?: GenreMap): Title {
  const rawDate = mediaType === 'movie' ? raw.release_date : raw.first_air_date;
  const date = normalizedDate(rawDate);
  const genres = Array.isArray(raw.genre_ids) ? raw.genre_ids.map((n:any) => genreNames?.get(Number(n))).filter((x:unknown): x is string => typeof x === 'string').slice(0,5)
    : (Array.isArray(raw.genres) ? raw.genres.map((g:any)=>String(g.name)).filter(Boolean).slice(0,5) : []);
  const id = `${mediaType}-${Number(raw.id)}`;
  const releaseDateSource = mediaType === 'movie' ? 'tmdb-primary-release-date' : 'tmdb-first-air-date';
  return {id,source:'tmdb',mediaType,title:String(raw.title || raw.name || 'Untitled'),overview:typeof raw.overview==='string'?raw.overview:'',tagline:typeof raw.tagline==='string'?raw.tagline:'',poster:raw.poster_path?`https://image.tmdb.org/t/p/w500${raw.poster_path}`:null,backdrop:raw.backdrop_path?`https://image.tmdb.org/t/p/w1280${raw.backdrop_path}`:null,releaseDate:date,releaseDateSource,releaseDateRegion:config().region,genres,runtime:typeof raw.runtime==='number'?raw.runtime:null,seasons:typeof raw.number_of_seasons==='number'?raw.number_of_seasons:null,status:titleStatus(date),voteAverage:typeof raw.vote_average==='number'?raw.vote_average:null,voteCount:typeof raw.vote_count==='number'?raw.vote_count:0,popularity:null,cast:[],trailerKey:null,director:null,budget:null,revenue:null};
}

export async function titleById(id: string): Promise<Title> {
  validateTitleId(id); assertModeForId(id);
  if (id.startsWith('demo-')) { const found = loadDemo().find(x => x.id === id); if (!found) throw notFound('Unknown title'); return found; }
  const key = cacheKey(`title:${id}`); const cached = cacheGet<Title>(key);
  if (cached) { const copy={...cached, genres:[...cached.genres], cast:[...cached.cast]}; copy.status=titleStatus(copy.releaseDate); return copy; }
  const [kind,numeric] = id.split('-');
  let raw:any; try { raw = await tmdb(`${kind}/${numeric}`, {append_to_response:'credits,videos'}); } catch (error) { return sanitizeTmdbError(error); }
  // Details responses carry named genres directly; list responses use the
  // media-specific genre map above. Avoid an unnecessary extra API request for
  // a details lookup while preserving dynamic list mapping.
  if (!raw || Number(raw.id)!==Number(numeric)) throw upstream('TMDB returned invalid title data');
  const title = mappedTmdb(raw, kind as MediaType, Array.isArray(raw?.genres) ? undefined : await genreMap(kind as MediaType));
  title.cast = Array.isArray(raw.credits?.cast) ? raw.credits.cast.slice(0,10).map((c:any)=>({name:String(c.name),character:String(c.character||''),profile:c.profile_path?`https://image.tmdb.org/t/p/w185${c.profile_path}`:null})) : [];
  title.director = Array.isArray(raw.credits?.crew) ? raw.credits.crew.find((c:any)=>c.job==='Director')?.name || null : null;
  title.trailerKey = Array.isArray(raw.videos?.results) ? raw.videos.results.find((v:any)=>v.site==='YouTube' && v.type==='Trailer')?.key || null : null;
  title.budget = typeof raw.budget === 'number' && raw.budget > 0 ? raw.budget : null;
  title.revenue = typeof raw.revenue === 'number' && raw.revenue > 0 ? raw.revenue : null;
  cacheSet(key,title,300_000); return title;
}

export async function genres(media: 'all'|'movie'|'tv'): Promise<{genres:string[]}> {
  if (mode() !== 'tmdb') return {genres:Array.from(new Set(loadDemo().flatMap(x=>x.genres))).sort((a,b)=>a.localeCompare(b))};
  const key = cacheKey(`genres:${media}`); const cached = cacheGet<string[]>(key); if (cached) return {genres:cached};
  const kinds: MediaType[] = media === 'all' ? ['movie','tv'] : [media];
  const values = new Set<string>(); for (const kind of kinds) for (const name of await namesFor(kind)) values.add(name);
  const result = Array.from(values).sort((a,b)=>a.localeCompare(b)); cacheSet(key,result,86_400_000); return {genres:result};
}

function pageNumber(page:number): number { if (!Number.isInteger(page) || page < 1 || page > 500) throw bad('page is invalid'); return page; }
function normalName(value:string): string { return value.trim().toLocaleLowerCase(); }
async function genreId(kind: MediaType, name:string): Promise<number|null> {
  const map=await genreMap(kind); const wanted=normalName(name); for (const [id,label] of map) if (normalName(label)===wanted) return id; return null;
}

type Source = {results:any[];total_pages:number;total_results:number};
function emptySource(): Source { return {results:[],total_pages:1,total_results:0}; }
function sourceData(value: any): Source {
  if (!value || !Array.isArray(value.results)) throw upstream('TMDB returned invalid catalog data');
  return {results:value.results,total_pages:Number.isInteger(value.total_pages)&&value.total_pages>0?value.total_pages:1,total_results:Number.isInteger(value.total_results)&&value.total_results>=0?value.total_results:value.results.length};
}
async function fetchSource(kind: MediaType, query: {collection:'trending'|'upcoming'|'top';search?:string;genre?:string;page:number}): Promise<Source> {
  const params:Record<string,string|number>={page:query.page}; let path:string;
  // Search deliberately means all matching titles in the selected media type.
  // The collection is not silently applied because TMDB search does not have a
  // reliable equivalent of trending/top/upcoming filtering.
  if (query.search) { path=`search/${kind}`; params.query=query.search.trim(); params.include_adult='false'; }
  else if (query.collection==='trending') path=`trending/${kind}/week`;
  else if (query.collection==='top') path=`${kind}/top_rated`;
  else path=`discover/${kind}`;
  if (!query.search && query.genre) {
    const id=await genreId(kind,query.genre); if (id===null) return emptySource();
    path=`discover/${kind}`; params.with_genres=id; params.sort_by=query.collection==='top'?'vote_average.desc':'popularity.desc';
    if(query.collection==='top')params['vote_count.gte']=kind==='movie'?200:50;
  }
  if (!query.search && query.collection==='upcoming') {
    const dateKey=kind==='tv' ? 'first_air_date.gte' : 'primary_release_date.gte';
    params[dateKey]=today(); params.sort_by=kind==='tv' ? 'first_air_date.asc' : 'primary_release_date.asc';
  }
  try { return sourceData(await tmdb(path,params)); }
  catch (error) {
    // TMDB rejects pages beyond a source's individual total with 400. A
    // mixed movie+TV page should still be valid when only one source ran out.
    if (error instanceof TmdbResponseError && error.code === 400 && query.page > 1) return emptySource();
    return sanitizeTmdbError(error);
  }
}
function sourceItems(source:Source, kind:MediaType, names?:GenreMap): Title[] {
  return (Array.isArray(source.results)?source.results:[]).flatMap((raw:any) => {
    if (!raw || !Number.isInteger(Number(raw.id))) return [];
    const actual=(raw.media_type==='movie'||raw.media_type==='tv') ? raw.media_type : kind;
    return actual===kind || (kind==='movie'&&actual==='movie') || (kind==='tv'&&actual==='tv') ? [mappedTmdb(raw,actual,names)] : [];
  });
}
function resultMeta(modeValue:'demo'|'tmdb', query: {media:'all'|'movie'|'tv';collection:'trending'|'upcoming'|'top';search?:string}, scope: CatalogResponse['totalResultsScope'], complete:boolean, ordering:CatalogOrdering, completeness:CatalogResponse['completeness']): Pick<CatalogResponse,'mode'|'totalResultsScope'|'totalResultsComplete'|'ordering'|'searchSemantics'|'completeness'> {
  return {mode:modeValue,totalResultsScope:scope,totalResultsComplete:complete,ordering,searchSemantics:query.search?'all-matching-titles':undefined,completeness};
}

export async function catalog(query: {media:'all'|'movie'|'tv',collection:'trending'|'upcoming'|'top',search?:string,genre?:string,page:number}): Promise<CatalogResponse> {
  const page=pageNumber(query.page); const search=query.search?.trim() || undefined;
  if (search && query.genre) throw bad('Search and genre cannot be combined; clear search to browse by genre');
  const normalizedQuery={...query,search};
  const catalogMode=mode();
  if (catalogMode === 'demo') {
    let items=loadDemo().filter(x=>query.media==='all'||x.mediaType===query.media);
    if (query.collection==='upcoming' && !search) items=items.filter(x=>x.status==='upcoming');
    if (search) { const term=search.toLocaleLowerCase(); items=items.filter(x=>`${x.title} ${x.overview}`.toLocaleLowerCase().includes(term)); }
    if (query.genre) items=items.filter(x=>x.genres.some(g=>normalName(g)===normalName(query.genre!)));
    const pageSize=12,totalResults=items.length,totalPages=Math.max(1,Math.ceil(totalResults/pageSize)),safePage=Math.min(page,totalPages);
    return {items:items.slice((safePage-1)*pageSize,safePage*pageSize),page:safePage,totalPages,totalResults,...resultMeta('demo',normalizedQuery,'complete-local',true,search?'demo-filter-order':'demo-source-order','complete-local')};
  }
  if (query.genre) {
    const available=await genres(query.media); if (!available.genres.some(x=>normalName(x)===normalName(query.genre!))) throw bad('Unknown genre');
  }
  const key=cacheKey(`catalog:${JSON.stringify({...normalizedQuery,page})}`); const cached=cacheGet<CatalogResponse>(key); if (cached) return cached;
  let items:Title[]=[]; let totalPages=1,totalResults=0;
  let meta: Pick<CatalogResponse,'totalResultsScope'|'totalResultsComplete'|'ordering'|'searchSemantics'|'completeness'>;
  if (query.media==='all' && query.collection==='trending' && !search && !query.genre) {
    let data:Source; try { data=sourceData(await tmdb('trending/all/week',{page})); } catch (error) { return sanitizeTmdbError(error); }
    // trending/all also contains people; only media records are titles. TMDB's
    // total_results includes people, so report only this page's retained title
    // count rather than presenting that provider total as a title total.
    const movieMap=await genreMap('movie'),tvMap=await genreMap('tv');
    items=data.results.flatMap((raw:any)=>raw?.media_type==='movie'?[mappedTmdb(raw,'movie',movieMap)]:raw?.media_type==='tv'?[mappedTmdb(raw,'tv',tvMap)]:[]);
    totalPages=data.total_pages; totalResults=items.length;
    meta={totalResultsScope:'loaded-page-titles',totalResultsComplete:false,ordering:'provider-page-order',completeness:'loaded-page-titles'};
  } else if (query.media==='all') {
    const kinds:MediaType[]=['movie','tv'];
    const sources=await Promise.all(kinds.map(kind=>fetchSource(kind,{collection:query.collection,search,genre:query.genre,page})));
    const maps=await Promise.all(kinds.map(kind=>genreMap(kind)));
    items=sources.flatMap((source,i)=>sourceItems(source,kinds[i],maps[i]));
    totalPages=Math.max(1,...sources.map(s=>Math.max(1,Number(s.total_pages||1)))); totalResults=sources.reduce((n,s)=>n+Math.max(0,Number(s.total_results||0)),0);
    meta={totalResultsScope:'mixed-provider-totals',totalResultsComplete:true,ordering:'mixed-source-page-order',completeness:'mixed-provider-pages'};
  } else {
    const kind=query.media; const source=await fetchSource(kind,{collection:query.collection,search,genre:query.genre,page});
    items=sourceItems(source,kind,await genreMap(kind)); totalPages=Math.max(1,Number(source.total_pages||1)); totalResults=Math.max(0,Number(source.total_results||items.length));
    meta={totalResultsScope:'provider-total',totalResultsComplete:true,ordering:query.collection==='upcoming'&&!search?'provider-release-date-ascending':'provider-page-order',completeness:'provider-paginated'};
  }
  const result={items,page,totalPages:Math.min(500,totalPages),totalResults,mode:'tmdb' as const,...meta,searchSemantics:search?('all-matching-titles' as const):undefined}; cacheSet(key,result,60_000); return result;
}

export async function season(id: string, number: number) {
  validateTitleId(id); assertModeForId(id); if (id.startsWith('demo-')) return {episodes:[]};
  const [kind,numeric]=id.split('-'); if (kind !== 'tv') throw bad('Seasons are available only for series');
  if (!Number.isInteger(number)||number<1||number>100) throw bad('Season number is invalid');
  const key=cacheKey(`season:${id}:${number}`); const cached=cacheGet<{episodes:any[]}>(key); if (cached) return cached;
  let data:any; try { data=await tmdb(`tv/${numeric}/season/${number}`); } catch (error) { return sanitizeTmdbError(error); }
  const result={episodes:Array.isArray(data?.episodes)?data.episodes.map((e:any)=>({id:Number(e.id),name:String(e.name||''),overview:String(e.overview||''),episodeNumber:Number(e.episode_number),airDate:normalizedDate(e.air_date),still:e.still_path?`https://image.tmdb.org/t/p/w500${e.still_path}`:null})):[]};
  cacheSet(key,result,86_400_000); return result;
}
export function demoCatalogForTests(): Title[] { return loadDemo().map(x=>({...x,genres:[...x.genres],cast:[]})); }

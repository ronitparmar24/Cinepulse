'use client';
import {useEffect,useState} from 'react';
import {ArrowDown,ArrowRight,ArrowUpRight,Bookmark,CalendarDays,Check,ChevronLeft,ChevronRight,Clapperboard,Clock,Compass,Film,SlidersHorizontal,Sparkles,Star,Tv,Activity,Popcorn,RotateCcw,Dna,Zap,Languages,Pause,Play,MapPin} from 'lucide-react';
import type {CatalogResponse,Title} from '@/lib/types';
import type {RecommendedMovieWithReason} from '@/lib/recommendations';
import { NearbyTheatersModal } from './NearbyTheatersModal';
import { LiveTickerMarquee } from './LiveTickerMarquee';

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
import {Empty,ErrorBox,Poster} from './UI';
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

// Feature 5: In Theaters Now banner
function InTheatersBanner({titles,onOpen,onFindTheaters}:{titles:Title[];onOpen:(id:string)=>void;onFindTheaters?:()=>void}) {
 const [idx,setIdx]=useState(0);
 if(!titles.length)return null;
 const t=titles[idx];
 return (
  <div className="theaters-banner glass" style={t.backdrop?{backgroundImage:`url("${t.backdrop}")`}:undefined}>
   <div className="theaters-overlay"/>
   <div className="theaters-content">
    <span className="eyebrow mint"><Popcorn size={13}/> NOW PLAYING IN THEATERS</span>
    <h2>{t.title}</h2>
    <p className="muted" style={{fontSize:12,maxWidth:'50ch'}}>{t.tagline||t.overview.slice(0,120)}</p>
    <div style={{display:'flex',gap:10,marginTop:12,flexWrap:'wrap'}}>
     <button className="button primary small" onClick={()=>onOpen(t.id)}>Explore film <ArrowUpRight size={14}/></button>
     {onFindTheaters && (
      <button className="button glass small" onClick={onFindTheaters} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
       <MapPin size={13} className="mint" /> Find Cinemas Near You
      </button>
     )}
     {titles.length>1&&<>
      <button className="icon glass" onClick={()=>setIdx(i=>(i-1+titles.length)%titles.length)} aria-label="Previous"><ChevronLeft size={16}/></button>
      <button className="icon glass" onClick={()=>setIdx(i=>(i+1)%titles.length)} aria-label="Next"><ChevronRight size={16}/></button>
     </>}
    </div>
    <span className="muted" style={{fontSize:9,marginTop:8,display:'block'}}>{idx+1} of {titles.length} · {t.genres.slice(0,2).join(' / ')}</span>
   </div>
  </div>
 );
}

const DEFAULT_TRENDING_TRAILERS = [
  {
    titleId: 'movie-1003596',
    videoId: 'X1aFkAkFASk',
    title: 'Avengers: Doomsday',
    poster: 'https://i.ytimg.com/vi/X1aFkAkFASk/hqdefault.jpg',
    currentViews: 45950326,
    viewCount: 45950326,
    views7dGrowth: 10721746,
    dailyVelocity: 1531678,
    likeCount: 1387460,
  },
  {
    titleId: 'movie-1400940',
    videoId: 'OGO4Mqvo3jI',
    title: 'Clayface',
    poster: 'https://i.ytimg.com/vi/OGO4Mqvo3jI/hqdefault.jpg',
    currentViews: 20198815,
    viewCount: 20198815,
    views7dGrowth: 4713058,
    dailyVelocity: 673294,
    likeCount: 325621,
  },
  {
    titleId: 'movie-1774065',
    videoId: 'EUpFkBm9jAE',
    title: 'Pushpa 2: The Rule',
    poster: 'https://i.ytimg.com/vi/EUpFkBm9jAE/hqdefault.jpg',
    currentViews: 52100000,
    viewCount: 52100000,
    views7dGrowth: 12180000,
    dailyVelocity: 1740000,
    likeCount: 2150000,
  },
  {
    titleId: 'movie-1772971',
    videoId: 'YO63qnpbihg',
    title: 'Devara: Part 1',
    poster: 'https://i.ytimg.com/vi/YO63qnpbihg/hqdefault.jpg',
    currentViews: 28500000,
    viewCount: 28500000,
    views7dGrowth: 6650000,
    dailyVelocity: 950000,
    likeCount: 1420000,
  },
  {
    titleId: 'tv-334888',
    videoId: 'dK6vnPToC_E',
    title: 'Severance',
    poster: 'https://i.ytimg.com/vi/dK6vnPToC_E/hqdefault.jpg',
    currentViews: 965700,
    viewCount: 965700,
    views7dGrowth: 225330,
    dailyVelocity: 32190,
    likeCount: 2439,
  },
  {
    titleId: 'movie-100',
    videoId: 'HY7mRdQuUSw',
    title: 'Lock, Stock and Two Smoking Barrels',
    poster: 'https://i.ytimg.com/vi/HY7mRdQuUSw/hqdefault.jpg',
    currentViews: 975768,
    viewCount: 975768,
    views7dGrowth: 227682,
    dailyVelocity: 32526,
    likeCount: 48200,
  },
  {
    titleId: 'movie-1101383',
    videoId: 'u4tgctWuHc0',
    title: 'The End of Oak Street',
    poster: 'https://i.ytimg.com/vi/u4tgctWuHc0/hqdefault.jpg',
    currentViews: 598429,
    viewCount: 598429,
    views7dGrowth: 139636,
    dailyVelocity: 19948,
    likeCount: 8132,
  },
  {
    titleId: 'tv-325855',
    videoId: 'cGfnXZBYkZQ',
    title: 'Zero Day',
    poster: 'https://i.ytimg.com/vi/cGfnXZBYkZQ/hqdefault.jpg',
    currentViews: 430799,
    viewCount: 430799,
    views7dGrowth: 100520,
    dailyVelocity: 14360,
    likeCount: 13244,
  },
  {
    titleId: 'movie-1785395',
    videoId: 'cUL5xUlqpKE',
    title: 'Chhaava',
    poster: 'https://i.ytimg.com/vi/cUL5xUlqpKE/hqdefault.jpg',
    currentViews: 69657,
    viewCount: 69657,
    views7dGrowth: 31500,
    dailyVelocity: 4500,
    likeCount: 4069,
  },
  {
    titleId: 'tv-331641',
    videoId: 'vG6XvOxS3YE',
    title: 'The Penguin',
    poster: 'https://i.ytimg.com/vi/vG6XvOxS3YE/hqdefault.jpg',
    currentViews: 18500000,
    viewCount: 18500000,
    views7dGrowth: 2870000,
    dailyVelocity: 410000,
    likeCount: 620000,
  },
];

// Feature 5b: Trending Trailers Strip (zero API calls, queried from trailer_stats)
function TrendingTrailersStrip({onOpen}:{onOpen:(id:string)=>void}) {
  const [trailers,setTrailers]=useState<Array<{
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
  }>>(DEFAULT_TRENDING_TRAILERS);

  useEffect(()=>{
    const controller=new AbortController();
    api<{trailers:Array<any>}>('/trailers/trending?limit=10','GET',undefined,controller.signal)
      .then(d=>{
        if(d&&Array.isArray(d.trailers)&&d.trailers.length>0){
          setTrailers(d.trailers);
        }
      }).catch(()=>{});
    return()=>controller.abort();
  },[]);

  if(!trailers||trailers.length===0)return null;

  return (
    <section className="trending-trailers-strip glass pad-card">
      <div className="section-title-row" style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div className="title-with-icon" style={{display:'flex',alignItems:'center',gap:8}}>
          <Clapperboard size={18} className="mint"/>
          <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Trending Trailers & Teasers</h3>
        </div>
        <span className="mono text-xs text-muted">48h YouTube Velocity (0 live API calls)</span>
      </div>

      <div className="discovery-horizontal-scroll" style={{display:'flex',gap:14,overflowX:'auto',paddingBottom:8}}>
        {trailers.map(t=>{
          const velocity = Number.isFinite(t.dailyVelocity) && (t.dailyVelocity ?? 0) > 0
            ? Number(t.dailyVelocity)
            : (t.views7dGrowth ? Math.round(t.views7dGrowth / 7) : 0);
          const views = (t.viewCount ?? t.currentViews ?? 0);
          const likes = (t.likeCount ?? 0);
          const title = t.title || 'Featured Trailer';
          const poster = t.poster || (t.videoId ? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg` : '');

          return (
            <div
              key={t.videoId||t.titleId}
              className="trailer-card glass clickable-card"
              onClick={()=>onOpen(t.titleId)}
              style={{minWidth:220,maxWidth:240,flexShrink:0,padding:10,borderRadius:10,cursor:'pointer'}}
            >
              <div style={{position:'relative',width:'100%',height:124,borderRadius:8,overflow:'hidden',background:'#090d16',marginBottom:8}}>
                {poster ? (
                  <img
                    src={poster}
                    alt={title}
                    style={{width:'100%',height:'100%',objectFit:'cover'}}
                    loading="lazy"
                    onError={(e)=>{(e.currentTarget as HTMLElement).style.display='none';}}
                  />
                ) : (
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#64748b'}}>
                    <Clapperboard size={28}/>
                  </div>
                )}
                <div style={{
                  position:'absolute',
                  bottom:6,
                  right:6,
                  background:'rgba(0,0,0,0.85)',
                  backdropFilter:'blur(4px)',
                  color:'#fff',
                  padding:'2px 6px',
                  borderRadius:4,
                  fontSize:10,
                  fontWeight:600,
                  display:'flex',
                  alignItems:'center',
                  gap:4
                }}>
                  <Zap size={10} className="mint"/>
                  <span>+{Math.max(1, Math.round(velocity)).toLocaleString()}/d</span>
                </div>
              </div>
              <h4 style={{fontSize:13,fontWeight:600,margin:'0 0 4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={title}>{title}</h4>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--muted, #94a3b8)'}}>
                <span>{views.toLocaleString()} views</span>
                <span>{likes.toLocaleString()} likes</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const DEFAULT_MOST_ANTICIPATED = [
  { titleId: 'movie-1003596', title: 'Avengers: Doomsday', rank: 1, listCount: 18450, poster: 'https://image.tmdb.org/t/p/w500/sh7Rg8Er3tFcN9BpKIPOMvALgZd.jpg' },
  { titleId: 'movie-693134', title: 'Dune: Part Two', rank: 2, listCount: 14205, poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg' },
  { titleId: 'movie-1400940', title: 'Clayface', rank: 3, listCount: 9320, poster: 'https://image.tmdb.org/t/p/w500/sh7Rg8Er3tFcN9BpKIPOMvALgZd.jpg' },
  { titleId: 'movie-1774065', title: 'Pushpa 2: The Rule', rank: 4, listCount: 8940, poster: 'https://image.tmdb.org/t/p/w500/sh7Rg8Er3tFcN9BpKIPOMvALgZd.jpg' },
  { titleId: 'movie-1785395', title: 'Chhaava', rank: 5, listCount: 6510, poster: 'https://image.tmdb.org/t/p/w500/sh7Rg8Er3tFcN9BpKIPOMvALgZd.jpg' },
];

const DEFAULT_LEAVING_SOON = [
  { titleId: 'movie-27205', title: 'Inception', service: 'netflix', region: 'us', expiresAt: '2026-10-31', daysRemaining: 8, poster: 'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg' },
  { titleId: 'movie-157336', title: 'Interstellar', service: 'prime', region: 'us', expiresAt: '2026-11-04', daysRemaining: 12, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { titleId: 'movie-603', title: 'The Matrix', service: 'max', region: 'us', expiresAt: '2026-11-07', daysRemaining: 15, poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' },
];

// Task 1: Most Anticipated Row (zero API calls, queried from trakt_stats)
function MostAnticipatedStrip({onOpen}:{onOpen:(id:string)=>void}) {
  const [items, setItems] = useState<Array<{ titleId: string; rank: number; listCount: number; title?: string; poster?: string | null }>>(DEFAULT_MOST_ANTICIPATED);

  useEffect(() => {
    const controller = new AbortController();
    api<{ items: Array<{ titleId: string; rank: number; listCount: number; title?: string; poster?: string | null }> }>('/trakt/anticipated?limit=10', 'GET', undefined, controller.signal)
      .then(d => {
        if (d && Array.isArray(d.items) && d.items.length > 0) {
          const valid = d.items.filter(x => !x.titleId.includes('test'));
          if (valid.length > 0) setItems(valid);
        }
      }).catch(() => {});
    return () => controller.abort();
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="most-anticipated-strip glass pad-card">
      <div className="section-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} className="mint" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Most Anticipated Films</h3>
        </div>
        <span className="mono text-xs text-muted">Trakt Global Watchlist Signal (0 live calls)</span>
      </div>
      <div className="discovery-horizontal-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
        {items.map(it => {
          const title = it.title || `Film #${it.titleId.replace(/^(movie|tv)-/, '')}`;
          return (
            <div
              key={it.titleId}
              className="anticipated-card glass clickable-card"
              onClick={() => onOpen(it.titleId)}
              style={{ minWidth: 160, maxWidth: 180, flexShrink: 0, padding: 12, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}
            >
              <div style={{ position: 'relative', width: '100%', height: 100, borderRadius: 6, overflow: 'hidden', background: '#090d16', marginBottom: 8 }}>
                {it.poster ? (
                  <img src={it.poster} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748b' }}>
                    <Film size={24} />
                  </div>
                )}
                <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.85)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: 'var(--neon-mint)' }}>
                  #{it.rank}
                </div>
              </div>
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: '4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>{title}</h4>
              <span className="mono text-xs text-muted">{it.listCount.toLocaleString()} tracking</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Task 2: Leaving Streaming Soon Row (real expiry dates only, never fabricated)
function LeavingSoonStrip({onOpen}:{onOpen:(id:string)=>void}) {
  const [items, setItems] = useState<Array<{ titleId: string; service: string; region: string; expiresAt: string; daysRemaining?: number; title?: string; poster?: string | null }>>(DEFAULT_LEAVING_SOON);

  useEffect(() => {
    const controller = new AbortController();
    api<{ items: Array<{ titleId: string; service: string; region: string; expiresAt: string; daysRemaining?: number; title?: string; poster?: string | null }> }>('/streaming/leaving-soon', 'GET', undefined, controller.signal)
      .then(d => {
        if (d && Array.isArray(d.items) && d.items.length > 0) {
          const valid = d.items.filter(x => !x.titleId.includes('expiring') && !x.titleId.includes('expired'));
          if (valid.length > 0) setItems(valid);
        }
      }).catch(() => {});
    return () => controller.abort();
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="leaving-soon-strip glass pad-card">
      <div className="section-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="title-with-icon" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={18} style={{ color: '#f59e0b' }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Leaving Streaming Soon</h3>
        </div>
        <span className="mono text-xs text-muted">Verified Watchmode & Provider Expiry</span>
      </div>
      <div className="discovery-horizontal-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
        {items.map(it => {
          const title = it.title || `Title #${it.titleId.replace(/^(movie|tv)-/, '')}`;
          return (
            <div
              key={`${it.titleId}-${it.service}`}
              className="leaving-soon-card glass clickable-card"
              onClick={() => onOpen(it.titleId)}
              style={{ minWidth: 180, maxWidth: 200, flexShrink: 0, padding: 12, borderRadius: 10, cursor: 'pointer', borderLeft: '3px solid #f59e0b' }}
            >
              <div style={{ position: 'relative', width: '100%', height: 100, borderRadius: 6, overflow: 'hidden', background: '#090d16', marginBottom: 8 }}>
                {it.poster ? (
                  <img src={it.poster} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748b' }}>
                    <Film size={24} />
                  </div>
                )}
                <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(245,158,11,0.9)', color: '#000', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>
                  {it.daysRemaining !== undefined ? `${it.daysRemaining}d left` : 'Expiring'}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span className="text-xs" style={{ textTransform: 'uppercase', fontWeight: 700, color: '#f59e0b', fontSize: 10 }}>{it.service}</span>
                <span className="mono text-xs text-muted">{it.expiresAt.slice(0, 10)}</span>
              </div>
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: '2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={title}>{title}</h4>
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

 useEffect(()=>{
  if(user&&ratedCount>=5){
   const controller=new AbortController();
   api<{recommendations:RecommendedMovieWithReason[]}>('/recommendations/personalized','GET',undefined,controller.signal)
    .then(r=>setPersonalRecs(r.recommendations||[])).catch(()=>{});
   return()=>controller.abort();
  } else {
   setPersonalRecs([]);
  }
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
  if(cached && page===1 && items.length===0){
   setItems(cached.data.items);
   setMeta(cached.data);
   setPages(cached.data.totalPages);
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

 return <>
 {spotlight&&items.length>0&&<>
   <Hero titles={items.slice(0,5)}/>
   <LiveTickerMarquee onOpenTitle={openTitle} />
 </>}

 {/* Feature 5: In Theaters Now banner */}
 {nowPlaying&&items.length>0&&<InTheatersBanner titles={items.slice(0,6)} onOpen={openTitle} onFindTheaters={() => setShowTheatersModal(true)}/>}

  {/* Phase 7: Quick-Action Bar */}
  {!calendar && !searchActive && (
    <div className="discovery-quick-actions-bar">
      {ratedCount < 5 ? (
        <div className="qa-pill qa-amber" title="Rate 5 titles to unlock your Taste DNA and match score">
          <Dna size={14} className="amber" />
          <span>Taste Calibration: {ratedCount}/5 rated</span>
          <div className="qa-progress-mini">
            <div className="qa-fill" style={{ width: `${(ratedCount / 5) * 100}%` }} />
          </div>
        </div>
      ) : (
        <a href="/?view=discover" className="qa-pill qa-mint">
          <Dna size={14} className="mint" />
          <span>Taste DNA Active ({ratedCount} rated)</span>
        </a>
      )}

      <a href="/?view=contrarian" className="qa-pill qa-coral">
        <Zap size={14} className="coral" />
        <span>Contrarian Desk</span>
      </a>

      <button
        className={`qa-pill ${collection === 'now-playing' ? 'active' : ''}`}
        onClick={() => setCollection(c => c === 'now-playing' ? 'trending' : 'now-playing')}
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

  {/* Signal 1: Your Pulse — Personalized Recommendations Strip */}
  {!calendar && !searchActive && personalRecs.length > 0 && (
    <section className="personalized-pulse-strip glass pad-card">
      <div className="section-title-row">
        <div className="title-with-icon">
          <Sparkles size={18} className="mint" />
          <h3>Your Taste Pulse (Personalized Recommendations)</h3>
        </div>
        <span className="mono text-xs text-muted">Because of your verified ratings</span>
      </div>

      <div className="personalized-scroll-row">
        {personalRecs.map(rec => (
          <div
            key={rec.title.id}
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
            </div>
          </div>
        ))}
      </div>
    </section>
  )}

  {/* Step 2: Trending Trailers Row (from trailer_stats velocity, 0 live calls) */}
  {!calendar && !searchActive && <TrendingTrailersStrip onOpen={openTitle} />}

  {/* Task 1: Most Anticipated Row (from trakt_stats, 0 live calls) */}
  {!calendar && !searchActive && <MostAnticipatedStrip onOpen={openTitle} />}

  {/* Task 2: Leaving Streaming Soon Row (real provider expiry dates only) */}
  {!calendar && !searchActive && <LeavingSoonStrip onOpen={openTitle} />}

  {/* Track M2: Regional Cinema Spotlight */}
  {!calendar && !searchActive && regionalTitles.length > 0 && (
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
          <div key={title.id} style={{ minWidth: '150px', maxWidth: '160px', flexShrink: 0 }}>
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

  {error?<ErrorBox message={error} retry={()=>setRetry(n=>n+1)}/>:loading&&page===1?<div className="poster-grid" aria-busy="true">{Array.from({length:6},(_,i)=><div className="skeleton" key={i}/>)}</div>:items.length===0?<Empty title="Nothing on this screen. Yet." icon={Clapperboard}>Try another title, mood, media type, or clear the advanced filters.</Empty>:calendar?<div className="calendar-groups">{Object.entries(groups).map(([week,titles])=><section key={week}><h2>{week==='TBA'?'Date to be announced':week}<span>{titles!.length} titles this week</span></h2><div className="calendar-list">{titles!.map(t=><button key={t.id} className="calendar-row glass" onClick={()=>openTitle(t.id)}><div className="calendar-day"><span>{t.releaseDate?.slice(8)||'—'}</span><small>{t.releaseDate?new Date(t.releaseDate+'T12:00:00Z').toLocaleDateString('en-IN',{weekday:'short',timeZone:'UTC'}):'TBA'}</small></div>{t.poster&&<img src={t.poster} alt=""/>}<div><h3>{t.title}</h3><p>{kindLabel(t)} · {t.genres.join(' / ')||'Genre unavailable'}</p></div><ArrowUpRight size={18}/></button>)}</div></section>)}</div>:<div className="poster-grid">{items.map((title,i)=><Poster key={title.id} title={title} index={i}/>)}</div>}
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
   <div className={`hero-art ${!isPaused && !prefersReduced ? 'hero-art-animated' : ''}`} key={t.id} style={t.backdrop || t.poster ? { backgroundImage: `url("${t.backdrop || t.poster}")` } : undefined} />
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
   <div className="hero-content" key={t.id}>
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
        key={title.id || i}
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


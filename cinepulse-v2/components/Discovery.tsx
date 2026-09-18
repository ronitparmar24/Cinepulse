'use client';
import {useEffect,useState} from 'react';
import {ArrowDown,ArrowRight,ArrowUpRight,Bookmark,CalendarDays,Check,ChevronLeft,ChevronRight,Clapperboard,Compass,Film,SlidersHorizontal,Sparkles,Star,Tv,Activity,Popcorn,RotateCcw} from 'lucide-react';
import type {CatalogResponse,Title} from '@/lib/types';
import {api,dateLabel,kindLabel} from './client';
import {useApp} from './Context';
import {Empty,ErrorBox,Poster} from './UI';

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
function InTheatersBanner({titles,onOpen}:{titles:Title[];onOpen:(id:string)=>void}) {
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

export function Discovery({search,calendar}:{search:string;calendar:boolean}){
 const {config,openTitle}=useApp();
 const [items,setItems]=useState<Title[]>([]);
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
 const [debounced,setDebounced]=useState(search);
 const [meta,setMeta]=useState<CatalogResponse|null>(null);
 // Feature 4: Advanced filters
 const [showAdvanced,setShowAdvanced]=useState(false);
 const [filterYear,setFilterYear]=useState('');
 const [filterRating,setFilterRating]=useState('');
 const [filterSort,setFilterSort]=useState('');

 useEffect(()=>{const timer=setTimeout(()=>setDebounced(search),350);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{setPage(1);},[media,genre,collection,debounced,calendar,filterYear,filterRating,filterSort]);
 useEffect(()=>{const controller=new AbortController();setGenreError('');setGenreList([]);setGenreLoading(true);api<{genres:string[]}>(`/genres?media=${media}`,'GET',undefined,controller.signal).then(x=>setGenreList(x.genres)).catch(e=>{if(e.name!=='AbortError')setGenreError(e.message||'Genres could not be loaded.');}).finally(()=>{if(!controller.signal.aborted)setGenreLoading(false);});return()=>controller.abort();},[media,genreRetry]);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');setPartialError('');if(page===1)setMeta(null);
  const params=new URLSearchParams({media,collection:calendar?'upcoming':collection,page:String(page)});
  if(debounced.trim())params.set('query',debounced.trim());
  else if(genre)params.set('genre',genre);
  if(filterYear)params.set('year',filterYear);
  if(filterRating)params.set('minRating',filterRating);
  if(filterSort)params.set('sortBy',filterSort);
  api<CatalogResponse>(`/catalog?${params}`,'GET',undefined,controller.signal)
   .then(data=>{if(controller.signal.aborted)return;if(!Array.isArray(data.items))throw new Error('Catalog data is unavailable.');setItems(prev=>page===1?data.items:[...prev,...data.items.filter(x=>!prev.some(p=>p.id===x.id))]);setPages(data.totalPages);setMeta(data);})
   .catch(e=>{if(e.name!=='AbortError'){if(page===1)setError(e.message);else setPartialError(e.message);}})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[media,genre,collection,debounced,page,calendar,retry,filterYear,filterRating,filterSort]);

 const spotlight=!calendar&&!debounced&&!genre&&media==='all'&&collection==='trending'&&!filterYear&&!filterRating;
 const nowPlaying=!calendar&&!debounced&&collection==='now-playing';
 const groups=Object.groupBy([...items].sort((a,b)=>(a.releaseDate||'9999-99-99').localeCompare(b.releaseDate||'9999-99-99')),t=>t.releaseDate?.slice(0,7)||'TBA');
 const searchActive=!!debounced.trim();
 const advancedActive=!!(filterYear||filterRating||filterSort);
 const currentYear=new Date().getFullYear();

 function resetAdvanced(){setFilterYear('');setFilterRating('');setFilterSort('');}

 return <>
 {spotlight&&items.length>0&&<Hero titles={items.slice(0,5)}/>}

 {/* Feature 5: In Theaters Now banner */}
 {nowPlaying&&items.length>0&&<InTheatersBanner titles={items.slice(0,6)} onOpen={openTitle}/>}

 <section className={`discovery-section section ${calendar?'calendar-section':''}`}>
  <div className="section-heading"><div><span className="eyebrow">{calendar?'MARK THE DATE':searchActive?'THE SEARCH PARTY':nowPlaying?'NOW PLAYING':'THE DISCOVERY EDIT'}</span><h1 className={spotlight?'section-title':''}>{calendar?'Great stories, coming soon.':searchActive?`Results for "${debounced}"`:nowPlaying?'In cinemas right now.':spotlight?'Find your next obsession.':'A world worth getting lost in.'}</h1>{calendar&&<p className="muted">Loaded release pages, not an exhaustive calendar.</p>}</div><span className="section-aside"><span className="mini-dot"/>{config?.mode==='demo'?'CURATED CONCEPT COLLECTION':config?.health?.status==='verified'?'TMDB · VERIFIED REACHABLE':'TMDB · STATUS UNKNOWN'}</span></div>

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

  {error?<ErrorBox message={error} retry={()=>setRetry(n=>n+1)}/>:loading&&page===1?<div className="poster-grid" aria-busy="true">{Array.from({length:6},(_,i)=><div className="skeleton" key={i}/>)}</div>:items.length===0?<Empty title="Nothing on this screen. Yet." icon={Clapperboard}>Try another title, mood, media type, or clear the advanced filters.</Empty>:calendar?<div className="calendar-groups">{Object.entries(groups).map(([month,titles])=><section key={month}><h2>{month==='TBA'?'Date to be announced':new Date(month+'-01T12:00:00Z').toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'})}<span>{titles!.length} titles shown</span></h2><div className="calendar-list">{titles!.map(t=><button key={t.id} className="calendar-row glass" onClick={()=>openTitle(t.id)}><div className="calendar-day"><span>{t.releaseDate?.slice(8)||'—'}</span><small>{t.releaseDate?new Date(t.releaseDate+'T12:00:00Z').toLocaleDateString('en-IN',{weekday:'short',timeZone:'UTC'}):'TBA'}</small></div>{t.poster&&<img src={t.poster} alt=""/>}<div><h3>{t.title}</h3><p>{kindLabel(t)} · {t.genres.join(' / ')||'Genre unavailable'}</p></div><ArrowUpRight size={18}/></button>)}</div></section>)}</div>:<div className="poster-grid">{items.map((title,i)=><Poster key={title.id} title={title} index={i}/>)}</div>}
  {partialError&&<ErrorBox message={`More results could not be loaded. ${partialError}`} retry={()=>setRetry(n=>n+1)}/>}
  {page<pages&&!error&&<div className="load-more"><button className="button secondary" disabled={loading} onClick={()=>setPage(n=>n+1)}>{loading?'Loading…':'Discover more'} <ArrowDown size={16}/></button></div>}
 </section>

 {!calendar&&!searchActive&&!nowPlaying&&<section className="editorial-grid section"><div className="editorial-note"><div className="eyebrow mint"><Activity size={14}/> AHEAD OF THE CURVE</div><h2>Everyone has a take.<br/><em>Make yours count.</em></h2><p>Save your prediction before opening night. See what the community thinks—and exactly how much evidence there is.</p><button className="text-link" onClick={()=>items[0]&&openTitle(items[0].id,'pulse')}>Explore a forecast <ArrowRight size={17}/></button></div><div className="glass editorial-card"><Sparkles size={26}/><h3>Big atmosphere.<br/>Zero made-up hype.</h3><p>No imaginary trailer views. No mysterious AI percentages. Just catalog facts, real account votes, and a little cinematic intuition.</p><span className="outline-pill">BUILT FOR THE CURIOUS</span></div></section>}
 </>;
}

function Hero({titles}:{titles:Title[]}){
 const [index,setIndex]=useState(0);const t=titles[index%titles.length];const {save,library,openTitle,busyIds}=useApp();const saved=library.some(e=>e.title.id===t.id);
 return <section className="hero" aria-label="Featured title"><div className="hero-art" key={t.id} style={t.backdrop||t.poster?{backgroundImage:`url("${t.backdrop||t.poster}")`}:undefined}/><div className="hero-overlay"/>
  <div className="hero-top"><span className="glass hero-eyebrow"><Sparkles size={12}/>{t.source==='demo'?'THE CONCEPT SPOTLIGHT':'IN THE SPOTLIGHT'}</span><span className="hero-counter">0{index+1} <span>/ 0{titles.length}</span></span></div>
  <div className="hero-content"><div className="hero-tags"><span>{kindLabel(t)}</span><i/>{t.genres.slice(0,2).join(' · ')}<i/>{t.releaseDate?.slice(0,4)||'TBA'}</div><h1>{t.title}</h1><p className="hero-tagline">{t.tagline||t.overview.slice(0,140)}</p><div className="hero-actions"><button className="button primary" onClick={()=>openTitle(t.id)}>Explore {t.mediaType==='tv'?'series':'film'} <ArrowUpRight size={17}/></button><button className="button glass" onClick={()=>save(t)} disabled={busyIds.has(t.id)}>{saved?<Check size={17}/>:<Bookmark size={17}/>} {saved?'In your library':'Watchlist'}</button></div><div className="hero-release"><CalendarDays size={14}/>{t.status==='upcoming'?'Expected ':t.status==='released'?'Released ':''}{dateLabel(t.releaseDate)}{t.source==='demo'&&<span>· Fictional release</span>}</div></div>
  <aside className="hero-pulse glass"><div className="pulse-mini-header"><span className="signal-icon"><Activity size={19}/></span><span>THE OPENING CALL<small>Community-powered foresight</small></span><ArrowUpRight size={17}/></div><h3>The next big thing?<br/><span>You tell us.</span></h3><p>A forecast is an opinion.<br/>Let's make the evidence visible.</p><button onClick={()=>openTitle(t.id,'pulse')}>Make your call <ArrowRight size={17}/></button></aside>
  <div className="hero-bottom"><span className="hero-line"/><span className="hero-quote">Cinema, ahead of the curve.</span><div className="hero-controls"><button className="icon glass" onClick={()=>setIndex((index-1+titles.length)%titles.length)} aria-label="Previous spotlight"><ChevronLeft size={17}/></button><button className="icon glass" onClick={()=>setIndex((index+1)%titles.length)} aria-label="Next spotlight"><ChevronRight size={17}/></button></div></div>
 </section>;
}

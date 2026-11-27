'use client';
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,Bookmark,Bot,Brain,CalendarDays,CheckCircle2,Clock,Download,Film,Heart,LayoutGrid,Lock,MessageCircle,PlayCircle,Popcorn,Share2,RotateCcw,ShieldCheck,Sparkles,Star,Timer,TrendingDown,TrendingUp,Users,Zap} from 'lucide-react';
import {useWatchlistMatches} from './ServicesPicker';
import {ShareSheet} from './ShareSheet';
import {openTonight} from './TonightPick';
import type {CatalogResponse,Forecast,Prediction,Review,Title} from '@/lib/types';
import {api,dateLabel,kindLabel,money} from './client';
import {useApp} from './Context';
import {Empty,ErrorBox,Methodology,Poster} from './UI';
import {ReviewCard} from './Reviews';
import {AiBadge} from './AiBadge';
import {CountUp,GrowBar,PkHero,PkTabs,closesLabel,daysUntil,stagger,useReveal} from './PredictKit';
import './community.css';
import {isReleased} from '@/lib/eligibility';
import type {SeriesProgress} from '@/lib/episodes';
import './episodes.css';
import {StatsDashboard} from './StatsDashboard';
import {SMART_LISTS,SMART_LIST_STORAGE_KEY,inSmartList,isSmartListId,smartListCounts,type SmartListId} from '@/lib/smartLists';
import './smart-lists.css';
import {
  getCachedCatalog,
  setCachedCatalog,
  getCachedPrediction,
  setCachedPrediction,
  getCachedCommunity,
  setCachedCommunity,
  formatCacheAge,
} from './catalogCache';

// ─── Library ──────────────────────────────────────────────────────────────────

export function Library(){
 const {user,library,showAuth,openTitle,updateLibrary,busyIds,config}=useApp();const [status,setStatus]=useState('all'),[sort,setSort]=useState('recent'),[query,setQuery]=useState('');
 const [smart,setSmartState]=useState<SmartListId>('all');
 const [sharing,setSharing]=useState<{id:string;title:string;v:string}|null>(null);
 const {matches,hasServices}=useWatchlistMatches(user?.id,library.length);
 // The chosen smart list survives reloads (read after mount so server and client markup match).
 useEffect(()=>{try{const saved=window.localStorage.getItem(SMART_LIST_STORAGE_KEY);if(isSmartListId(saved))setSmartState(saved);}catch{/* storage unavailable */}},[]);
 // Keep the active chip visible in the (horizontally scrolling) chip row, e.g. after a restore.
 const smartRow=useRef<HTMLDivElement>(null);
 useEffect(()=>{const row=smartRow.current;const chip=row?.querySelector<HTMLElement>('.sl-chip.is-on');if(!row||!chip)return;if(chip.offsetLeft<row.scrollLeft||chip.offsetLeft+chip.offsetWidth>row.scrollLeft+row.clientWidth)row.scrollLeft=Math.max(0,chip.offsetLeft-16);},[smart,library.length]);
 function setSmart(id:SmartListId){setSmartState(id);try{window.localStorage.setItem(SMART_LIST_STORAGE_KEY,id);}catch{/* storage unavailable */}}
 const smartCtx={matches};
 const inView=library.filter(x=>(status==='all'||x.status===status)&&x.title.title.toLowerCase().includes(query.toLowerCase()));
 const smartCounts=smartListCounts(inView,smartCtx);
 const smartDef=SMART_LISTS.find(l=>l.id===smart)??SMART_LISTS[0];
 const entries=inView.filter(x=>inSmartList(smart,x,smartCtx)).sort((a,b)=>sort==='title'?a.title.title.localeCompare(b.title.title):sort==='rating'?(b.rating||0)-(a.rating||0):b.updatedAt.localeCompare(a.updatedAt));
 // Logging, rating or un-watching changes the stats: refetch them when this signature moves.
 const statsKey=`${library.length}:${library.filter(x=>x.status==='watched').length}:${library.reduce((n,x)=>n+(x.rating||0),0)}:${library.reduce((m,x)=>x.updatedAt>m?x.updatedAt:m,'')}`;
 function snapshotLabel(title:Title){if(!config)return 'Saved catalog snapshot';return title.source===config.mode?`Saved from ${title.source==='demo'?'fictional demo':'TMDB'}`:`Saved ${title.source==='demo'?'fictional demo':'TMDB'} snapshot · current catalog is ${config.mode==='demo'?'demo':'TMDB'}`;}
 return <section className="section space-page"><div className="space-heading"><span className="eyebrow mint">THE STORIES YOU KEEP</span><h1>A little library.<br/>Entire worlds inside.</h1><p>Your next obsession and the ones you'll never forget.</p></div>
 {!user?<Empty title="Make room for your favourites." icon={Bookmark} action={<button className="button primary" onClick={showAuth}>Create your free local account <ArrowUpRight size={16}/></button>}>Sign in to keep your watchlist, watched history, and private ratings in your database—not just a browser tab.</Empty>:<>
 <div className="library-stats"><div><Bookmark size={21}/><strong>{library.filter(x=>x.status==='watchlist').length}</strong><span>Want to watch</span></div><div><Film size={21}/><strong>{library.filter(x=>x.status==='watching').length}</strong><span>Watching</span></div><div><CheckCircle2 size={21}/><strong>{library.filter(x=>x.status==='watched').length}</strong><span>Watched</span></div><div><Star size={21}/><strong>{library.filter(x=>x.rating!==null).length}</strong><span>Rated by you</span></div></div>
 <div className="library-tools">
  <button type="button" className="library-tonight" onClick={openTonight}><Popcorn size={17}/><span><b>Tonight’s pick</b><small>One film from your watchlist that fits tonight</small></span><ArrowUpRight size={16}/></button>
 </div>
 <NextUpRail/>
 <StatsDashboard userId={user.id} refreshKey={statsKey} onOpenTitle={id=>openTitle(id)}/>
 <div className="filter-bar"><div className="segmented glass">{[['all','Everything'],['watchlist','Watchlist'],['watching','Watching'],['watched','Watched']].map(([key,label])=><button key={key} className={status===key?'active':''} onClick={()=>setStatus(key)}>{label}</button>)}</div><div className="filter-selects"><input className="library-search" aria-label="Search your library" placeholder="Search your library…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Sort library" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently saved</option><option value="title">Title A–Z</option><option value="rating">Your highest rated</option></select><a className="icon" href="/api/export" download aria-label="Export your data"><Download size={18}/></a></div></div>
 {library.length>0&&<div ref={smartRow} className="sl-row" role="group" aria-label="Smart lists">{SMART_LISTS.map((l,i)=>{const Icon=SMART_ICONS[l.id];const on=smart===l.id;return <button key={l.id} type="button" className={`sl-chip ${on?'is-on':''}`} aria-pressed={on} onClick={()=>setSmart(l.id)} style={{'--i':i} as React.CSSProperties}><Icon size={14} aria-hidden/>{l.label}<span className="sl-count" aria-label={`${smartCounts[l.id]} titles`}>{smartCounts[l.id]}</span></button>;})}</div>}
 {entries.length?<div key={smart} className="poster-grid library-grid sl-grid">{entries.map(({title,status:state,rating,updatedAt},i)=><div key={title.id}><Poster title={title} index={i}/><div className="library-entry-footer"><label><span>{state==='watchlist'?'Want to watch':state==='watching'?'Watching':'Watched'}</span><select aria-label={`Library status for ${title.title}`} value={state} disabled={busyIds.has(title.id)} onChange={e=>{const next=e.target.value as 'watchlist'|'watching'|'watched';void updateLibrary(title,next)}}><option value="watchlist">Want to watch</option><option value="watching" disabled={!isReleased(title.releaseDate)}>Watching</option><option value="watched" disabled={!isReleased(title.releaseDate)}>Watched</option></select></label>{rating!==null&&<span className="mint">★ {rating}</span>}{(matches[title.id]?.length??0)>0&&<span className="svc-mini"><PlayCircle size={12}/> {matches[title.id].join(', ')}</span>}{state==='watched'&&<button type="button" className="library-share" onClick={()=>setSharing({id:title.id,title:title.title,v:updatedAt})} aria-label={`Share that you watched ${title.title}`}><Share2 size={13}/> Share</button>}<small title={new Date(updatedAt).toLocaleString('en-IN')}>{snapshotLabel(title)}</small></div></div>)}</div>:!library.length?<Empty title="Your next movie night starts here." icon={Bookmark}>Tap the + on any poster to build your personal collection.</Empty>:smart==='services'&&!hasServices?<Empty title="Pick your services first." icon={PlayCircle}>Choose the streaming services you pay for in your profile → Services, and this list fills with what you can watch right now.</Empty>:<div key={`empty-${smart}`} className="sl-empty"><Empty title={smartDef.emptyTitle} icon={SMART_ICONS[smart]}>{status!=='all'||query?'Nothing matches here with your current filter or search.':smartDef.emptyBody}</Empty></div>}</>}
 {sharing&&<ShareSheet kind="watched" id={sharing.id} title={sharing.title} version={sharing.v} onClose={()=>setSharing(null)}/>}
 </section>;
}

const SMART_ICONS:Record<SmartListId,typeof Bookmark>={all:LayoutGrid,services:PlayCircle,short:Timer,month:CalendarDays,loved:Star,unrated:Sparkles};

// ─── Library: Next up for series in progress (episode tracking, lib/episodes.ts) ─

function NextUpRail(){
 const {user,library,openTitle}=useApp();
 const userId=user?.id;
 const watchingKey=library.filter(x=>x.title.mediaType==='tv'&&x.status==='watching').map(x=>x.title.id).join(',');
 const [series,setSeries]=useState<SeriesProgress[]>([]);
 useEffect(()=>{
  if(!userId||!watchingKey){setSeries([]);return;}
  const controller=new AbortController();
  api<{series:SeriesProgress[]}>('/episodes','GET',undefined,controller.signal).then(d=>setSeries(d.series)).catch(()=>{});
  return()=>controller.abort();
 },[userId,watchingKey]);
 const items=series.flatMap(s=>{const entry=library.find(x=>x.title.id===s.titleId);return entry&&entry.status==='watching'&&s.nextUp?[{entry,s,next:s.nextUp}]:[];});
 if(!items.length)return null;
 return <section className="ep-rail" aria-label="Next up in your series"><h2>Next up</h2><div className="ep-rail-list">{items.map(({entry,s,next})=><button key={entry.title.id} type="button" className="ep-rail-card" onClick={()=>openTitle(entry.title.id)}>
  {entry.title.poster?<img src={entry.title.poster} alt="" loading="lazy"/>:<i className="ep-rail-ph"/>}
  <span><b>{entry.title.title}</b><em>S{next.season}E{next.episode}{next.name?` — ${next.name}`:''}</em><small>{next.airDate&&!isReleased(next.airDate)?`Airs ${dateLabel(next.airDate)}`:`${s.watchedCount} episode${s.watchedCount===1?'':'s'} watched`}</small></span>
 </button>)}</div></section>;
}

// ─── Community ────────────────────────────────────────────────────────────────

type CommunityFilter='all'|'humans'|'ai-crew'|'first-impression'|'review'|'mine';
type CommunitySort='latest'|'liked'|'discussed';

function CommunitySkeleton(){
 return <div className="review-grid" aria-busy="true" aria-label="Loading takes">{Array.from({length:4}).map((_,i)=><div key={i} className="cm-skel" style={stagger(i)}><div className="cm-skel-head"><div className="ex-skel cm-skel-avatar"/><div className="cm-skel-lines"><div className="ex-skel pk-skel-line w40"/><div className="ex-skel pk-skel-line w60"/></div></div><div className="ex-skel pk-skel-line w60"/><div className="ex-skel pk-skel-line w80"/><div className="ex-skel pk-skel-line w40"/><div className="pk-skel-chips"><div className="ex-skel pk-skel-chip"/><div className="ex-skel pk-skel-chip"/></div></div>)}</div>;
}

export function Community(){
 const {user,showAuth}=useApp();
 const cachedComm = getCachedCommunity();
 const [reviews,setReviews]=useState<Review[]|null>(cachedComm ? cachedComm.data : null);
 const [error,setError]=useState('');
 const [version,setVersion]=useState(0);
 const [filter,setFilter]=useState<CommunityFilter>('all');
 const [sort,setSort]=useState<CommunitySort>('latest');
 const [loading,setLoading]=useState(!cachedComm);
 const [cacheMeta,setCacheMeta]=useState<{cachedAt:number;fromCache:boolean}|null>(
  cachedComm ? {cachedAt: cachedComm.cachedAt, fromCache: true} : null
 );

 useEffect(()=>{
  let active=true;
  setError('');
  if (!cachedComm || cachedComm.isExpired || version > 0) {
   setLoading(true);
   api<{reviews:Review[]}>('/community')
    .then(d=>{
     if(active){
      setReviews(d.reviews);
      setCachedCommunity(d.reviews);
      setCacheMeta({cachedAt:Date.now(),fromCache:false});
     }
    })
    .catch(e=>active&&setError(e.message||'The community feed could not be loaded.'))
    .finally(()=>active&&setLoading(false));
  }
  return()=>{active=false;};
 },[version]);
 const inFilter=(r:Review,key:CommunityFilter)=>key==='all'||key==='mine'&&r.userId===user?.id||key==='ai-crew'&&!!r.isAi||key==='humans'&&!r.isAi||key===r.kind;
 const filterDefs:[CommunityFilter,string][]=[['all','All takes'],['humans','Humans'],['ai-crew','AI Pulse Crew'],['first-impression','First impressions'],['review','Reviews'],...(user?[['mine','My takes']] as [CommunityFilter,string][]:[])];
 const filterTabs=filterDefs.map(([id,label])=>({id,label,icon:id==='ai-crew'?Bot:undefined,count:reviews?reviews.filter(r=>inFilter(r,id)).length:undefined}));
 // Likes / comment counts come with the feed; only offer those sorts when the data carries them.
 const canSortByEngagement=!!reviews?.some(r=>typeof r.likesCount==='number'||typeof r.commentsCount==='number');
 const sortTabs:{id:CommunitySort;label:string;icon:typeof Clock}[]=[{id:'latest',label:'Latest',icon:Clock},...(canSortByEngagement?[{id:'liked' as const,label:'Most liked',icon:Heart},{id:'discussed' as const,label:'Most discussed',icon:MessageCircle}]:[])];
 const activeSort:CommunitySort=canSortByEngagement?sort:'latest';
 const byDate=(a:Review,b:Review)=>b.createdAt.localeCompare(a.createdAt);
 const shown=reviews?.filter(r=>inFilter(r,filter)).sort((a,b)=>activeSort==='liked'?(b.likesCount??0)-(a.likesCount??0)||byDate(a,b):activeSort==='discussed'?(b.commentsCount??0)-(a.commentsCount??0)||byDate(a,b):byDate(a,b));
 const humans=reviews?.filter(r=>!r.isAi).length??0, crew=reviews?.filter(r=>r.isAi).length??0;
 return <section className="section space-page cm-page">
 <PkHero icon={MessageCircle} tone="amber" kicker="Good films. Great conversations." title={<>For the love of <em>talking cinema.</em></>} sub="First impressions, thoughtful reviews, and simulated AI critic commentary side-by-side.">
  <div className="pk-stats">
   <span className="pk-stat"><MessageCircle size={14}/><b>{reviews?<CountUp value={reviews.length}/>:'—'}</b> takes</span>
   <span className="pk-stat"><Users size={14}/><b>{reviews?<CountUp value={humans}/>:'—'}</b> from humans</span>
   <span className="pk-stat"><Bot size={14}/><b>{reviews?<CountUp value={crew}/>:'—'}</b> from the AI crew</span>
  </div>
 </PkHero>
 <div className="community-guideline glass cm-guideline"><MessageCircle size={22}/><div><b>Keep it thoughtful. Keep the spoilers covered.</b><p>Open a title to write your take. Human cinephiles and simulated AI critic personas share takes openly.</p></div><span className="outline-pill guideline-ai-pill"><AiBadge /> DISCLOSED</span></div>
 <div className="cm-toolbar">
  <PkTabs<CommunityFilter> label="Filter takes" tabs={filterTabs} value={filter} onChange={setFilter}/>
  <div className="cm-toolbar-row">
   <div className="cm-sorts" role="group" aria-label="Sort takes">{sortTabs.map(({id,label,icon:Icon})=><button key={id} type="button" className={`cm-sort ${activeSort===id?'is-on':''}`} aria-pressed={activeSort===id} onClick={()=>setSort(id)}><Icon size={13} aria-hidden/>{label}</button>)}</div>
   <div className="pk-toolbar-meta">
    {cacheMeta && (
     <span className="catalog-sync-indicator" title="Community feed cached for 1 hour to optimize performance.">
      <Clock size={10} style={{verticalAlign:'middle'}}/>
      {cacheMeta.fromCache ? `Cached (${formatCacheAge(cacheMeta.cachedAt).ageText})` : 'Synced'} · Refresh in {formatCacheAge(cacheMeta.cachedAt).remainingMinutes}m
     </span>
    )}
    <button className="text-link" disabled={loading} onClick={()=>setVersion(v=>v+1)}>{loading?'Refreshing…':'Refresh feed'} <RotateCcw size={13} className={loading?'spin':undefined}/></button>
   </div>
  </div>
 </div>
 {error?<ErrorBox message={error} retry={()=>setVersion(v=>v+1)}/>:!shown?<CommunitySkeleton/>:<div aria-busy={loading||undefined}>{shown.length?<div key={`${filter}-${activeSort}`} className="review-grid cm-grid">{shown.map((r,i)=><div key={r.id+version} className="cm-card ex-in" style={stagger(i)}><ReviewCard review={r} onDelete={()=>setVersion(v=>v+1)}/></div>)}</div>:<div className="cm-empty ex-in"><Empty title="A good conversation starts with one person." icon={Users} action={!user?<button className="button primary" onClick={showAuth}>Join the conversation <ArrowUpRight size={16}/></button>:undefined}>No takes in this view yet. Open a film or series and share your first impression. We don&apos;t fill the silence with fake reviews.</Empty></div>}</div>}
 </section>;
}

// ─── Open calls: market cards ─────────────────────────────────────────────────

const CONFIDENCE:Record<Prediction['confidence'],{label:string;bars:number;tone:string}>={
 high:{label:'High confidence',bars:4,tone:'is-mint'},
 medium:{label:'Medium confidence',bars:3,tone:'is-lavender'},
 low:{label:'Low confidence',bars:2,tone:'is-amber'},
 'very-low':{label:'Very low confidence',bars:1,tone:'is-coral'},
};

function ConfidenceChip({confidence}:{confidence:Prediction['confidence']}){
 const c=CONFIDENCE[confidence];if(!c)return null;
 return <span className={`pk-chip ${c.tone}`}><span className="pk-conf" aria-hidden>{[1,2,3,4].map(n=><i key={n} className={n<=c.bars?'on':undefined}/>)}</span>{c.label}</span>;
}

function ClosesChip({releaseDate,now}:{releaseDate:string|null|undefined;now:number}){
 const c=closesLabel(daysUntil(releaseDate,now));if(!c)return null;
 return <span className={`pk-chip ${c.urgent?'is-amber':''}`} title="Forecasts lock on release day (UTC)">{c.urgent?<i className="pk-dot" aria-hidden/>:c.locked?<Lock size={11} aria-hidden/>:<Timer size={11} aria-hidden/>}{c.text}</span>;
}

function MarketSkeleton({count=6}:{count?:number}){
 return <div className="pk-markets" aria-busy="true" aria-label="Loading predictions">{Array.from({length:count}).map((_,i)=><div key={i} className="pk-skel-mkt" style={stagger(i)}>
  <div className="pk-skel-row"><div className="ex-skel pk-skel-poster"/><div className="pk-skel-lines"><div className="ex-skel pk-skel-line w80"/><div className="ex-skel pk-skel-line w40"/></div></div>
  <div className="ex-skel pk-skel-big"/><div className="ex-skel pk-skel-bar"/>
  <div className="pk-skel-chips"><div className="ex-skel pk-skel-chip"/><div className="ex-skel pk-skel-chip"/></div>
 </div>)}</div>;
}

function PredictionRow({title,rank,now,onOpen}:{title:Title;rank:number;now:number;onOpen:()=>void}) {
  const cachedPred = getCachedPrediction(title.id);
  const [pred,setPred]=useState<Prediction|null>(cachedPred ? cachedPred.data : null);

  useEffect(()=>{
    if (cachedPred && !cachedPred.isExpired) {
      return;
    }
    const controller=new AbortController();
    api<{prediction:Prediction}>(`/prediction/${title.id}`,'GET',undefined,controller.signal)
      .then(d=>{
        setPred(d.prediction);
        setCachedPrediction(title.id, d.prediction);
      }).catch(()=>{});
    return()=>controller.abort();
  },[title.id]);

  // 0 / 0 means the model abstained (not enough pre-release signal): say so instead of showing "0% FLOP".
  const abstained = !!pred && pred.hitProbability===0 && pred.flopProbability===0;
  const hit = Math.max(0,Math.min(100,pred?.hitProbability ?? 0));
  const flop = Math.max(0,Math.min(100-hit,pred?.flopProbability ?? 0));
  const isHit = hit >= 55;

  return (
    <button type="button" className="pk-mkt pk-lift pk-rv ex-in" style={stagger((rank-1)%6)} onClick={onOpen} aria-label={`${title.title}: open AI prediction`}>
      <div className="pk-mkt-top">
        <span className="pk-mkt-poster">{title.poster&&<img src={title.poster} alt="" loading="lazy"/>}<span className="pk-mkt-rank">#{rank}</span></span>
        <div className="pk-mkt-info">
          <h3>{title.title}</h3>
          <p>{kindLabel(title)} · {title.genres.slice(0,2).join(' / ')} · {dateLabel(title.releaseDate)}</p>
        </div>
        <ArrowUpRight size={16} className="pk-mkt-arrow" aria-hidden/>
      </div>
      {!pred ? (
        <div className="pk-mkt-loading" aria-label="Loading prediction"><div className="ex-skel pk-skel-big"/><div className="ex-skel pk-skel-bar"/></div>
      ) : abstained ? (
        <div className="pk-mkt-abstain"><b>No call yet</b>Not enough pre-release signal for an honest estimate.</div>
      ) : (
        <>
          <div className={`pk-odds ${isHit?'is-hit':'is-flop'}`}>
            <div className="pk-odds-main"><CountUp value={hit} suffix="%"/><small>chance of a hit</small></div>
            <span className={`pk-verdict ${isHit?'is-hit':'is-flop'}`}>{isHit?<TrendingUp size={13}/>:<TrendingDown size={13}/>}{isHit?'HIT':'FLOP'}</span>
          </div>
          <div>
            <span className="pk-split" role="img" aria-label={`Hit ${hit}%, flop ${flop}%`}>
              <i className="is-hit" style={{'--v':`${hit}%`} as React.CSSProperties}/>
              <i className="is-flop" style={{'--v':`${flop}%`} as React.CSSProperties}/>
            </span>
            <span className="pk-split-legend" aria-hidden><span className="is-hit">Hit {hit}%</span>{hit+flop<100&&<span>Uncertain {100-hit-flop}%</span>}<span className="is-flop">Flop {flop}%</span></span>
          </div>
        </>
      )}
      <div className="pk-mkt-chips">
        {pred&&!abstained&&<ConfidenceChip confidence={pred.confidence}/>}
        <ClosesChip releaseDate={title.releaseDate} now={now}/>
        {pred?.revenueEstimate?<span className="pk-chip is-mint"><Zap size={11} aria-hidden/>{money(pred.revenueEstimate)}</span>:null}
      </div>
    </button>
  );
}

// ─── PredictionHub ────────────────────────────────────────────────────────────

type HubTab='desk'|'mine'|'method';

export function PredictionHub(){
 const {user,config,openTitle,showAuth}=useApp();
 const upcomingCacheKey = 'media=all&collection=upcoming&page=1';
 const cachedUpcoming = getCachedCatalog(upcomingCacheKey);

 const [titles,setTitles]=useState<Title[]|null>(cachedUpcoming ? cachedUpcoming.data.items : null);
 const [mine,setMine]=useState<{forecast:Forecast;title:Title}[]>([]);
 const [tab,setTab]=useState<HubTab>('desk');
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const [aiTab,setAiTab]=useState<'leaderboard'|'upcoming'>('leaderboard');
 const [cacheMeta, setCacheMeta] = useState<{cachedAt:number;fromCache:boolean}|null>(
  cachedUpcoming ? {cachedAt: cachedUpcoming.cachedAt, fromCache: true} : null
 );
 const [now,setNow]=useState(()=>Date.now());

 // 1-minute live ticker for the countdown chips
 useEffect(()=>{
  const ticker=setInterval(()=>setNow(Date.now()),60000);
  return()=>clearInterval(ticker);
 },[]);

 useEffect(()=>{
  let active=true;
  setError('');

  if (cachedUpcoming && !cachedUpcoming.isExpired && revision === 0) {
   setTitles(cachedUpcoming.data.items);
   setCacheMeta({cachedAt: cachedUpcoming.cachedAt, fromCache: true});
  } else {
   api<CatalogResponse>(`/catalog?${upcomingCacheKey}`)
    .then(d=>{
     if(active){
      setTitles(d.items);
      setCachedCatalog(upcomingCacheKey, d);
      setCacheMeta({cachedAt: Date.now(), fromCache: false});
     }
    })
    .catch(e=>active&&setError(e.message));
  }

  if(user)api<{items:{forecast:Forecast;title:Title}[]}>('/my-forecasts').then(d=>active&&setMine(d.items)).catch(e=>active&&setError(e.message));
  else setMine([]);
  return()=>{active=false;};
 },[user?.id,revision]);

 const revealRef=useReveal<HTMLDivElement>(`${tab}:${aiTab}:${titles?.length??-1}:${mine.length}`);
 const openCount=titles?titles.filter(t=>(daysUntil(t.releaseDate,now)??1)>0).length:null;

 return <section className="section space-page prediction-page">
  <PkHero icon={Activity} kicker="The prediction desk" title={<>Less guesswork. <em>More perspective.</em></>} sub="AI revenue predictions + community calls. Know where the evidence ends.">
   <div className="pk-stats">
    <span className="pk-stat"><Brain size={14}/><b>AI model</b> heuristic revenue predictor</span>
    <span className="pk-stat"><Timer size={14}/><b>{openCount===null?'—':<CountUp value={openCount}/>}</b> open markets</span>
    <span className="pk-stat"><TrendingUp size={14}/><b><CountUp value={mine.length}/></b> your recorded forecasts</span>
    <span className="pk-stat"><ShieldCheck size={14}/><b>Transparent</b> visible counts &amp; uncertainty</span>
   </div>
  </PkHero>

  <div className="pk-toolbar">
   <PkTabs<HubTab> label="Prediction desk views" value={tab} onChange={key=>{setTab(key);if(key==='mine')setRevision(r=>r+1);}}
    tabs={[{id:'desk',label:'AI + Upcoming',icon:Brain},{id:'mine',label:'My forecasts',icon:Activity,count:user?mine.length:undefined},{id:'method',label:'How it works',icon:ShieldCheck}]}/>
   <div className="pk-toolbar-meta">
    <span className="muted small-text">Forecasts lock on release day · UTC</span>
    {cacheMeta && (
     <span className="catalog-sync-indicator" title="Predictions & upcoming catalog cached for 1 hour to protect API quota.">
      <Clock size={10} style={{verticalAlign:'middle'}}/>
      {cacheMeta.fromCache ? `Cached (${formatCacheAge(cacheMeta.cachedAt).ageText})` : 'Synced'} · Refresh in {formatCacheAge(cacheMeta.cachedAt).remainingMinutes}m
      <button
       className="catalog-sync-btn"
       onClick={()=>setRevision(r=>r+1)}
       title="Refresh predictions and upcoming catalog now"
       aria-label="Refresh predictions and upcoming catalog now"
      >
       <RotateCcw size={10}/>
      </button>
     </span>
    )}
   </div>
  </div>

  <div ref={revealRef}>
  {tab==='method'?<div className="ex-in"><Methodology/></div>:error?<ErrorBox message={error} retry={()=>setRevision(v=>v+1)}/>:
   tab==='mine'?<>
    {!user?<Empty title="Your predictions, with a paper trail." icon={Activity} action={<button className="button primary" onClick={showAuth}>Sign in to start</button>}>Make a call before a title opens, attach your reasoning, and keep it in your account.</Empty>:
    mine.length?<div className="pk-calls">{mine.map(({title,forecast:f},i)=><button type="button" className="pk-call pk-lift pk-rv ex-in" style={stagger(i)} key={title.id} onClick={()=>openTitle(title.id,'pulse')}>
     {title.poster?<img src={title.poster} alt="" loading="lazy"/>:<span className="pk-call-ph"/>}
     <div>
      <h3>{title.title}</h3>
      <p>{kindLabel(title)} · Expected {dateLabel(title.releaseDate)} · Updated {new Date(f.updatedAt).toLocaleDateString('en-IN')}</p>
      <div className="pk-call-conf"><span>Confidence</span><GrowBar value={f.confidence} tone={f.choice==='hit'?'mint':'coral'} delay={120}/><b className="pk-num">{f.confidence}%</b></div>
      <q>{f.reason||'No reason attached.'}</q>
      <ClosesChip releaseDate={title.releaseDate} now={now}/>
     </div>
     <span className={`pk-verdict ${f.choice==='hit'?'is-hit':'is-flop'}`}>{f.choice==='hit'?<TrendingUp size={13}/>:<TrendingDown size={13}/>}{f.choice.toUpperCase()}</span>
    </button>)}</div>:
    <Empty title="No calls on the record. Yet." icon={Activity}>Pick an upcoming title and open its Prediction desk to make your first forecast.</Empty>}
   </>:
   /* ── Desk: AI market cards + upcoming grid ── */
   !titles?<MarketSkeleton/>:
   <>
    <div className="pk-subtabs">
     <PkTabs label="Desk view" size="sm" value={aiTab} onChange={setAiTab} tabs={[{id:'leaderboard',label:'AI Leaderboard',icon:Brain},{id:'upcoming',label:'All Upcoming',icon:Activity,count:titles.length}]}/>
    </div>

    {aiTab==='leaderboard' ? (
     <div className="pred-leaderboard pk-markets-wrap">
      <div className="pk-markets-head">
       <span className="eyebrow mint"><Brain size={13}/> AI REVENUE &amp; HIT PREDICTIONS</span>
       <span className="outline-pill">SOONEST RELEASES FIRST</span>
      </div>
      <p className="pred-leader-note">Heuristic model predictions using genre, budget, TMDB signals, and release seasonality. Listed by release date, soonest first. <strong>Not a financial forecast.</strong></p>
      {titles.length?
       <div className="pk-markets">
        {titles.map((t,i)=><PredictionRow key={t.id} title={t} rank={i+1} now={now} onOpen={()=>openTitle(t.id,'pulse')}/>)}
       </div>:
       <Empty title="No upcoming titles found." icon={Activity}>Check the catalog configuration or come back when new releases are announced.</Empty>
      }
      <div className="pred-disclaimer-box">
       <Brain size={15}/>
       <p>AI model uses publicly available metadata signals only. Outputs are rule-based estimates, not trained ML predictions. No outcome has been adjudicated. Community votes are independent of model scores.</p>
      </div>
     </div>
    ) : (
     <>
      <div className="section-heading compact"><div><h2>Call it before the crowd.</h2><p className="muted">Choose a title to see its AI prediction, community poll, evidence availability, and scenario tools.</p></div><span className="outline-pill">{config?.mode==='demo'?'FICTIONAL TITLES · REAL VOTES':'LIVE CATALOG · LOCAL VOTES'}</span></div>
      {titles.length?<div className="poster-grid">{titles.map((t,i)=><div key={t.id} className="ex-in" style={stagger(i)}><Poster title={t} index={i}/><button className="call-button" onClick={()=>openTitle(t.id,'pulse')}>Open AI prediction <ArrowUpRight size={14}/></button></div>)}</div>:<Empty title="No upcoming titles found." icon={Activity}>Check the catalog configuration or come back when new releases are announced.</Empty>}
     </>
    )}
   </>
  }
  </div>
 </section>;
}

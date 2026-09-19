'use client';
import {useEffect,useState} from 'react';
import {Activity,ArrowUpRight,Bookmark,Brain,CheckCircle2,Clock,Download,Film,MessageCircle,RotateCcw,ShieldCheck,Sparkles,Star,TrendingDown,TrendingUp,Users,Zap} from 'lucide-react';
import type {CatalogResponse,Forecast,Prediction,Review,Title} from '@/lib/types';
import {api,dateLabel,kindLabel,money} from './client';
import {useApp} from './Context';
import {Empty,ErrorBox,Loading,Methodology,Poster} from './UI';
import {ReviewCard} from './Reviews';
import {isReleased} from '@/lib/eligibility';
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
 const entries=library.filter(x=>(status==='all'||x.status===status)&&x.title.title.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='title'?a.title.title.localeCompare(b.title.title):sort==='rating'?(b.rating||0)-(a.rating||0):b.updatedAt.localeCompare(a.updatedAt));
 function snapshotLabel(title:Title){if(!config)return 'Saved catalog snapshot';return title.source===config.mode?`Saved from ${title.source==='demo'?'fictional demo':'TMDB'}`:`Saved ${title.source==='demo'?'fictional demo':'TMDB'} snapshot · current catalog is ${config.mode==='demo'?'demo':'TMDB'}`;}
 return <section className="section space-page"><div className="space-heading"><span className="eyebrow mint">THE STORIES YOU KEEP</span><h1>A little library.<br/>Entire worlds inside.</h1><p>Your next obsession and the ones you'll never forget.</p></div>
 {!user?<Empty title="Make room for your favourites." icon={Bookmark} action={<button className="button primary" onClick={showAuth}>Create your free local account <ArrowUpRight size={16}/></button>}>Sign in to keep your watchlist, watched history, and private ratings in your database—not just a browser tab.</Empty>:<>
 <div className="library-stats"><div><Bookmark size={21}/><strong>{library.filter(x=>x.status==='watchlist').length}</strong><span>Want to watch</span></div><div><Film size={21}/><strong>{library.filter(x=>x.status==='watching').length}</strong><span>Watching</span></div><div><CheckCircle2 size={21}/><strong>{library.filter(x=>x.status==='watched').length}</strong><span>Watched</span></div><div><Star size={21}/><strong>{library.filter(x=>x.rating!==null).length}</strong><span>Rated by you</span></div></div>
 <div className="filter-bar"><div className="segmented glass">{[['all','Everything'],['watchlist','Watchlist'],['watching','Watching'],['watched','Watched']].map(([key,label])=><button key={key} className={status===key?'active':''} onClick={()=>setStatus(key)}>{label}</button>)}</div><div className="filter-selects"><input className="library-search" aria-label="Search your library" placeholder="Search your library…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Sort library" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Recently saved</option><option value="title">Title A–Z</option><option value="rating">Your highest rated</option></select><a className="icon" href="/api/export" download aria-label="Export your data"><Download size={18}/></a></div></div>
 {entries.length?<div className="poster-grid library-grid">{entries.map(({title,status:state,rating,updatedAt},i)=><div key={title.id}><Poster title={title} index={i}/><div className="library-entry-footer"><label><span>{state==='watchlist'?'Want to watch':state==='watching'?'Watching':'Watched'}</span><select aria-label={`Library status for ${title.title}`} value={state} disabled={busyIds.has(title.id)} onChange={e=>{const next=e.target.value as 'watchlist'|'watching'|'watched';void updateLibrary(title,next)}}><option value="watchlist">Want to watch</option><option value="watching" disabled={!isReleased(title.releaseDate)}>Watching</option><option value="watched" disabled={!isReleased(title.releaseDate)}>Watched</option></select></label>{rating!==null&&<span className="mint">★ {rating}</span>}<small title={new Date(updatedAt).toLocaleString('en-IN')}>{snapshotLabel(title)}</small></div></div>)}</div>:<Empty title={library.length?'No titles in this view.':'Your next movie night starts here.'} icon={Bookmark}>{library.length?'Try another filter or search.':'Tap the + on any poster to build your personal collection.'}</Empty>}</>}
 </section>;
}

// ─── Community ────────────────────────────────────────────────────────────────

export function Community(){
 const {user,showAuth}=useApp();
 const cachedComm = getCachedCommunity();
 const [reviews,setReviews]=useState<Review[]|null>(cachedComm ? cachedComm.data : null);
 const [error,setError]=useState('');
 const [version,setVersion]=useState(0);
 const [filter,setFilter]=useState('all');
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
 const shown=reviews?.filter(r=>filter==='all'||filter==='mine'&&r.userId===user?.id||filter===r.kind);
 return <section className="section space-page"><div className="space-heading"><span className="eyebrow mint">GOOD FILMS. GREAT CONVERSATIONS.</span><h1>For the love<br/>of talking cinema.</h1><p>First impressions, thoughtful reviews, and a place for every kind of film person.</p></div>
 <div className="community-guideline glass"><MessageCircle size={24}/><div><b>Keep it thoughtful. Keep the spoilers covered.</b><p>Open a title to write your take. This feed shows the latest 50 reviews from this installation—older entries are not paginated here.</p></div><span className="outline-pill">REAL ACCOUNTS ONLY</span></div>
 <div className="filter-bar">
  <div className="segmented glass">{[['all','All conversations'],['first-impression','First impressions'],['review','Reviews'],...(user?[['mine','My takes']]:[] as [string,string][])].map(([key,label])=><button className={filter===key?'active':''} onClick={()=>setFilter(key)} key={key}>{label}</button>)}</div>
  <div style={{display:'flex',alignItems:'center',gap:10}}>
   {cacheMeta && (
    <span className="catalog-sync-indicator" title="Community feed cached for 1 hour to optimize performance.">
     <Clock size={10} style={{verticalAlign:'middle'}}/>
     {cacheMeta.fromCache ? `Cached (${formatCacheAge(cacheMeta.cachedAt).ageText})` : 'Synced'} · Refresh in {formatCacheAge(cacheMeta.cachedAt).remainingMinutes}m
    </span>
   )}
   <button className="text-link" disabled={loading} onClick={()=>setVersion(v=>v+1)}>{loading?'Refreshing…':'Refresh feed'} <RotateCcw size={13}/></button>
  </div>
 </div>
 {error?<ErrorBox message={error} retry={()=>setVersion(v=>v+1)}/>:!shown?<Loading/>:<div aria-busy={loading||undefined}>{shown.length?<div className="review-grid">{shown.map(r=><ReviewCard key={r.id+version} review={r} onDelete={()=>setVersion(v=>v+1)}/>)}</div>:<Empty title="A good conversation starts with one person." icon={Users} action={!user?<button className="button primary" onClick={showAuth}>Join the conversation <ArrowUpRight size={16}/></button>:undefined}>No takes in this view yet. Open a film or series and share your first impression. We don't fill the silence with fake reviews.</Empty>}</div>}
 </section>;
}

// ─── AI Leaderboard Row ───────────────────────────────────────────────────────

function PredictionRow({title,rank,onOpen}:{title:Title;rank:number;onOpen:()=>void}) {
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

  const isHit = (pred?.hitProbability ?? 50) >= 55;

  return (
    <button className="pred-leader-row glass" onClick={onOpen}>
      <span className="pred-rank">#{rank}</span>
      {title.poster&&<img src={title.poster} alt=""/>}
      <div className="pred-leader-info">
        <h3>{title.title}</h3>
        <p>{kindLabel(title)} · {title.genres.slice(0,2).join(' / ')} · {dateLabel(title.releaseDate)}</p>
      </div>
      {pred ? (
        <div className="pred-leader-scores">
          <div className={`pred-leader-verdict ${isHit?'verdict-hit':'verdict-flop'}`}>
            {isHit?<TrendingUp size={14}/>:<TrendingDown size={14}/>}
            <span>{isHit?'HIT':'FLOP'}</span>
          </div>
          <div className="pred-leader-bar-wrap">
            <div className="pred-leader-bar">
              <div className="pred-leader-fill" style={{width:`${pred.hitProbability}%`}}/>
            </div>
            <span className="pred-leader-pct">{pred.hitProbability}%</span>
          </div>
          {pred.revenueEstimate&&<span className="pred-leader-rev"><Zap size={11}/>{money(pred.revenueEstimate)}</span>}
          {!pred.revenueEstimate&&<span className="pred-leader-rev muted">Rev: N/A</span>}
        </div>
      ) : (
        <div className="pred-leader-scores pred-leader-loading">
          <div className="spin"><Sparkles size={14}/></div>
        </div>
      )}
      <ArrowUpRight size={16} className="pred-leader-arrow"/>
    </button>
  );
}

// ─── PredictionHub ────────────────────────────────────────────────────────────

export function PredictionHub(){
 const {user,config,openTitle,showAuth}=useApp();
 const upcomingCacheKey = 'media=all&collection=upcoming&page=1';
 const cachedUpcoming = getCachedCatalog(upcomingCacheKey);

 const [titles,setTitles]=useState<Title[]|null>(cachedUpcoming ? cachedUpcoming.data.items : null);
 const [mine,setMine]=useState<{forecast:Forecast;title:Title}[]>([]);
 const [tab,setTab]=useState('desk');
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const [aiTab,setAiTab]=useState<'leaderboard'|'upcoming'>('leaderboard');
 const [cacheMeta, setCacheMeta] = useState<{cachedAt:number;fromCache:boolean}|null>(
  cachedUpcoming ? {cachedAt: cachedUpcoming.cachedAt, fromCache: true} : null
 );
 const [,setClockTick]=useState(0);

 // 1-minute live ticker for countdown
 useEffect(()=>{
  const ticker=setInterval(()=>setClockTick(t=>t+1),60000);
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

 return <section className="section space-page prediction-page">
  <div className="space-heading">
   <span className="eyebrow mint"><Activity size={15}/> THE PREDICTION DESK</span>
   <h1>Less guesswork.<br/><span className="soft-serif">More perspective.</span></h1>
   <p>AI revenue predictions + community calls. Know where the evidence ends.</p>
  </div>

  {/* Stats bar */}
  <div className="hub-summary">
   <div className="glass"><span className="signal-icon"><Brain size={20}/></span><div><strong>AI Model</strong><span>Heuristic revenue predictor</span></div></div>
   <div className="glass"><span className="signal-icon"><TrendingUp size={20}/></span><div><strong>{mine.length}</strong><span>Your recorded forecasts</span></div></div>
   <div className="glass"><span className="signal-icon lavender"><ShieldCheck size={20}/></span><div><strong>Transparent</strong><span>Visible counts &amp; uncertainty</span></div></div>
  </div>

  {/* Tabs */}
  <div className="filter-bar">
   <div className="segmented glass">
    {[['desk','AI + Upcoming'],['mine','My forecasts'],['method','How it works']].map(([key,label])=>(
     <button key={key} onClick={()=>{setTab(key);if(key==='mine')setRevision(r=>r+1);}} className={tab===key?'active':''}>
      {key==='desk'&&<Brain size={13}/>}
      {label}
     </button>
    ))}
   </div>
   <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
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

  {tab==='method'?<Methodology/>:error?<ErrorBox message={error} retry={()=>setRevision(v=>v+1)}/>:
   tab==='mine'?<>
    {!user?<Empty title="Your predictions, with a paper trail." icon={Activity} action={<button className="button primary" onClick={showAuth}>Sign in to start</button>}>Make a call before a title opens, attach your reasoning, and keep it in your account.</Empty>:
    mine.length?<div className="forecast-list">{mine.map(({title,forecast:f})=><button className="forecast-row glass" key={title.id} onClick={()=>openTitle(title.id,'pulse')}>{title.poster&&<img src={title.poster} alt=""/>}<div><h3>{title.title}</h3><p>{kindLabel(title)} · Expected {dateLabel(title.releaseDate)}</p><small>{f.reason||'No reason attached.'}</small></div><div className={`forecast-badge ${f.choice}`}><b>{f.choice.toUpperCase()}</b><small>Your confidence: {f.confidence}%</small><small>Updated {new Date(f.updatedAt).toLocaleDateString('en-IN')}</small></div><ArrowUpRight size={18}/></button>)}</div>:
    <Empty title="No calls on the record. Yet." icon={Activity}>Pick an upcoming title and open its Prediction desk to make your first forecast.</Empty>}
   </>:
   /* ── Desk: AI leaderboard + upcoming grid ── */
   !titles?<Loading/>:
   <>
    {/* Sub-tabs: leaderboard vs grid */}
    <div className="ai-sub-tabs">
     <button className={aiTab==='leaderboard'?'active':''} onClick={()=>setAiTab('leaderboard')}><Brain size={13}/> AI Leaderboard</button>
     <button className={aiTab==='upcoming'?'active':''} onClick={()=>setAiTab('upcoming')}><Activity size={13}/> All Upcoming</button>
    </div>

    {aiTab==='leaderboard' ? (
     <div className="pred-leaderboard">
      <div className="pred-leader-header">
       <span className="eyebrow mint"><Brain size={13}/> AI REVENUE &amp; HIT PREDICTIONS</span>
       <span className="outline-pill">SORTED BY HIT PROBABILITY</span>
      </div>
      <p className="pred-leader-note">Heuristic model predictions using genre, budget, TMDB signals, and release seasonality. Sorted by predicted hit probability. <strong>Not a financial forecast.</strong></p>
      {titles.length?
       <div className="pred-leader-list">
        {/* Sort by hit probability once predictions load — show in source order initially */}
        {titles.map((t,i)=><PredictionRow key={t.id} title={t} rank={i+1} onOpen={()=>openTitle(t.id,'pulse')}/>)}
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
      {titles.length?<div className="poster-grid">{titles.map((t,i)=><div key={t.id}><Poster title={t} index={i}/><button className="call-button" onClick={()=>openTitle(t.id,'pulse')}>Open AI prediction <ArrowUpRight size={14}/></button></div>)}</div>:<Empty title="No upcoming titles found." icon={Activity}>Check the catalog configuration or come back when new releases are announced.</Empty>}
     </>
    )}
   </>
  }
 </section>;
}

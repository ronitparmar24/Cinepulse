'use client';
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,Bookmark,Brain,Check,Clapperboard,Clock,Film,MessageCircle,Play,TrendingDown,TrendingUp,Users} from 'lucide-react';
import type {Prediction,Title} from '@/lib/types';
import {isReleased} from '@/lib/eligibility';
import {api,dateLabel,kindLabel,money} from './client';
import {useApp} from './Context';
import {ErrorBox,Loading,Modal} from './UI';
import {ForecastPanel} from './ForecastPanel';
import {TitleReviews} from './Reviews';

type DetailTab='overview'|'pulse'|'reviews';
const tabs:[DetailTab,string,typeof Film][]=[['overview','Overview',Film],['pulse','Prediction desk',Activity],['reviews','Community',MessageCircle]];

// ─── Mini Prediction Badge (used in overview tab) ──────────────────────────────
function MiniPredictionBadge({titleId}:{titleId:string}) {
  const [pred,setPred]=useState<Prediction|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    api<{prediction:Prediction}>(`/prediction/${titleId}`,'GET',undefined,controller.signal)
      .then(d=>setPred(d.prediction))
      .catch(()=>{}); // non-critical — badge disappears on error
    return()=>controller.abort();
  },[titleId]);

  if (!pred) return null;
  const isHit = pred.hitProbability >= 55;
  return (
    <div className={`mini-pred-badge ${isHit?'mini-hit':'mini-flop'}`}>
      <Brain size={12}/>
      <span>AI: {isHit?'Hit':'Flop'} prediction</span>
      <strong>{pred.hitProbability}%</strong>
      {pred.revenueEstimate && <span className="mini-rev">· {money(pred.revenueEstimate)}</span>}
    </div>
  );
}

export function TitleDetail({id,initialTab,onClose,onTabChange}:{id:string;initialTab:DetailTab;onClose:()=>void;onTabChange?:(tab:DetailTab)=>void}){
 const {library,save,remove,updateLibrary,busyIds}=useApp();const [title,setTitle]=useState<Title|null>(null),[tab,setTab]=useState<DetailTab>(initialTab),[error,setError]=useState(''),[retry,setRetry]=useState(0);const tabRefs=useRef<(HTMLButtonElement|null)[]>([]);
 useEffect(()=>setTab(initialTab),[initialTab]);
 useEffect(()=>{const controller=new AbortController();setTitle(null);setError('');api<{title:Title}>(`/title/${id}`,'GET',undefined,controller.signal).then(d=>setTitle(d.title)).catch(e=>{if(e.name!=='AbortError')setError(e.message||'This title could not be loaded.');});return()=>controller.abort();},[id,retry]);
 function changeTab(next:DetailTab){setTab(next);onTabChange?.(next);}
 function tabKey(event:React.KeyboardEvent<HTMLButtonElement>,index:number){let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();const key=tabs[next][0];changeTab(key);tabRefs.current[next]?.focus();}
 const entry=library.find(e=>e.title.id===id);const released=!!title&&isReleased(title.releaseDate);const canViewStatus=released;
 return <Modal label={title?.title||'Title details'} wide onClose={onClose}>{error?<div className="modal-pad"><ErrorBox message={error} retry={()=>{setError('');setRetry(n=>n+1);}}/></div>:!title?<Loading/>:<>
  <div className={`detail-cover ${title.backdrop||title.poster?'':'detail-cover-empty'}`} style={title.backdrop||title.poster?{backgroundImage:`url("${title.backdrop||title.poster}")`}:undefined}><div className="detail-cover-shade"/>{!title.backdrop&&!title.poster&&<Clapperboard className="detail-cover-placeholder" size={48} aria-label="Artwork unavailable"/>}
  <div className="detail-heading">
    <span className="eyebrow">{title.source==='demo'?'ORIGINAL CONCEPT':kindLabel(title).toUpperCase()} · {title.genres.slice(0,2).join(' / ')}</span>
    <h2>{title.title}</h2>
    <p>{title.tagline}</p>
    {/* Mini AI badge on upcoming titles */}
    {title.status==='upcoming' && <MiniPredictionBadge titleId={id}/>}
  </div></div>
  <div className="detail-content">
  <div className="detail-toolbar">
   <div className="detail-info">
    <span>{dateLabel(title.releaseDate)}</span>
    {title.runtime&&<span><Clock size={13}/>{Math.floor(title.runtime/60)}h {title.runtime%60}m</span>}
    {title.voteCount>0&&title.voteAverage!==null&&<span className="rating">★ {title.voteAverage.toFixed(1)} <small>TMDB · {title.voteCount.toLocaleString()} votes</small></span>}
   </div>
   <div className="detail-actions">
    <button className="button secondary small" onClick={()=>entry?remove(title):save(title)} disabled={busyIds.has(id)}>{entry?<Check size={16}/>:<Bookmark size={16}/>} {entry?'Remove from library':'Save to watchlist'}</button>
    {title.trailerKey&&/^[a-zA-Z0-9_-]{6,20}$/.test(title.trailerKey)&&<a className="button primary small" href={`https://www.youtube.com/watch?v=${encodeURIComponent(title.trailerKey)}`} target="_blank" rel="noreferrer"><Play size={15}/> Trailer <ArrowUpRight size={14}/></a>}
   </div>
  </div>

  <div className="detail-tabs" role="tablist" aria-label="Title sections" aria-orientation="horizontal">
   {tabs.map(([key,label,Icon],index)=><button key={key} ref={node=>{tabRefs.current[index]=node}} id={`tab-${key}-${id}`} role="tab" type="button" aria-selected={tab===key} aria-controls={`panel-${key}-${id}`} tabIndex={tab===key?0:-1} className={tab===key?'active':''} onKeyDown={e=>tabKey(e,index)} onClick={()=>changeTab(key)}><Icon size={16}/>{label}{key==='pulse'&&<span className="pulse-tab-dot"/>}</button>)}
  </div>

  <div role="tabpanel" tabIndex={0} id={`panel-${tab}-${id}`} aria-labelledby={`tab-${tab}-${id}`}>
  {tab==='pulse'?<ForecastPanel title={title}/>:tab==='reviews'?<TitleReviews title={title}/>:
  <div className="overview"><div className="overview-grid">
   <div>
    <span className="eyebrow">THE STORY</span>
    <h3>{title.tagline||'A story worth discovering.'}</h3>
    <p className="synopsis">{title.overview||'A synopsis is not available for this title yet.'}</p>
    <div className="genre-pills">{title.genres.map(g=><span key={g}>{g}</span>)}</div>
    <div className="title-facts">
     <div><small>{title.mediaType==='tv'?'CREATOR / DIRECTOR':'DIRECTOR'}</small><b>{title.director||'Not listed'}</b></div>
     <div><small>RELEASE STATUS</small><b>{title.status==='upcoming'?'Coming soon':released?'Released':'Unconfirmed'}</b></div>
     {title.budget&&<div><small>PRODUCTION BUDGET</small><b>{money(title.budget)}</b></div>}
     {title.revenue&&<div><small>ACTUAL REVENUE</small><b>{money(title.revenue)}</b></div>}
     <div><small>DATA SOURCE</small><b>{title.source==='demo'?'Fictional concept':'TMDB'}</b></div>
    </div>
   </div>
   <aside className="journal-box glass"><Bookmark size={21}/><h3>Your cinema journal</h3><p>One place for your next watch and your all-time favourites.</p>
    <label>Library status<select aria-label="Library status" value={entry?.status||''} disabled={busyIds.has(id)} onChange={e=>e.target.value&&updateLibrary(title,e.target.value as 'watchlist'|'watching'|'watched')}>
     <option value="" disabled>Not in your library</option>
     <option value="watchlist">Want to watch</option>
     <option value="watching" disabled={!canViewStatus}>Currently watching</option>
     <option value="watched" disabled={!canViewStatus}>Watched</option>
    </select></label>
    {canViewStatus&&<label>Your private rating<select aria-label="Your private rating" value={entry?.rating??''} disabled={busyIds.has(id)} onChange={e=>updateLibrary(title,'watched',e.target.value?Number(e.target.value):null)}>
     <option value="">Not rated</option>
     {[1,2,3,4,5].map(n=><option key={n} value={n}>{'★'.repeat(n)} · {n}/5</option>)}
    </select></label>}
    <small>{canViewStatus?(title.mediaType==='tv'?'Watched is a title-level status; it does not verify that every episode was completed. Rating here marks this title watched. Share a review separately to make your opinion public.':'Rating here marks this title watched. Share a review separately to make your opinion public.'):'This title has no confirmed past release date. Watchlist is available; watching, watched, and ratings open after release.'}</small>
   </aside>
  </div>

  {title.cast.length>0?<section className="cast-section"><h3>The people behind the story</h3><div className="cast-list">{title.cast.map((c,i)=><div className="cast-person" key={c.name+i}>{c.profile?<img src={c.profile} alt="" loading="lazy"/>:<span><Users size={23}/></span>}<b>{c.name}</b><small>{c.character}</small></div>)}</div></section>:<p className="availability"><Users size={16}/> {title.source==='demo'?'Cast and trailers are not supplied for fictional concept titles.':'Cast information is not available.'}</p>}

  {title.mediaType==='tv'&&<Episodes title={title}/>}

  <button className="prediction-invite glass" onClick={()=>changeTab('pulse')}>
   <span className="signal-icon"><Brain size={22}/></span>
   <div>
    <span className="eyebrow mint">BEFORE OPENING NIGHT</span>
    <h3>AI prediction + your opening call.</h3>
    <p>See the model estimate, evidence availability, and make your own forecast.</p>
   </div>
   <ArrowUpRight size={23}/>
  </button>

  {title.source==='demo'&&<p className="fineprint">This title, release date, and artwork are fictional demonstration content. Your saved library, first impressions, and forecast votes are real records in this installation's database.</p>}
  </div>}
  </div></div></>}</Modal>;
}

function Episodes({title}:{title:Title}){
 const [season,setSeason]=useState(1),[episodes,setEpisodes]=useState<{id:number;name:string;overview:string;episodeNumber:number;airDate:string|null;still:string|null}[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!title.seasons)return;const controller=new AbortController();setEpisodes(null);setError('');api<{episodes:NonNullable<typeof episodes>}>(`/title/${title.id}/season/${season}`,'GET',undefined,controller.signal).then(d=>setEpisodes(d.episodes)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[title.id,title.seasons,season]);
 return <section className="episodes"><div className="section-heading compact"><h3>Seasons & episodes</h3>{!!title.seasons&&<select aria-label="Select season" value={season} onChange={e=>setSeason(Number(e.target.value))}>{Array.from({length:Math.min(100,title.seasons)},(_,i)=><option key={i} value={i+1}>Season {i+1}</option>)}</select>}</div>{!title.seasons?<p className="muted">No episode details are available for this title yet.</p>:error?<ErrorBox message={error}/>:episodes===null?<Loading/>:episodes.length===0?<p className="muted">No episodes reported in this season.</p>:<div className="episode-list">{episodes.map(e=><details key={e.id} className="episode"><summary><span>{String(e.episodeNumber).padStart(2,'0')}</span><b>{e.name}</b><small>{dateLabel(e.airDate)}</small></summary><div>{e.still&&<img src={e.still} alt="" loading="lazy"/>}<p>{e.overview||'No synopsis available.'}</p></div></details>)}</div>}</section>;
}

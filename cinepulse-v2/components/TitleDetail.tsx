'use client';
import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,Bookmark,Brain,Check,Clapperboard,Clock,ExternalLink,Film,MessageCircle,Play,ShoppingBag,Tv2,TrendingDown,TrendingUp,Users,Compass} from 'lucide-react';
import type {Prediction,Title,WatchProviderInfo} from '@/lib/types';
import {isReleased} from '@/lib/eligibility';
import {api,dateLabel,kindLabel,money} from './client';
import {useApp} from './Context';
import {ErrorBox,Loading,Modal} from './UI';
import {ForecastPanel} from './ForecastPanel';
import {TitleReviews} from './Reviews';
import {PersonDetail} from './PersonDetail';
import {CinePulseScoreCard} from './CinePulseScoreCard';
import {WhyThisMovie} from './WhyThisMovie';
import {CinemaMapView} from './CinemaMapView';
import { useReducedMotion } from './hooks/useReducedMotion';

type DetailTab='overview'|'pulse'|'reviews';
const tabs:[DetailTab,string,typeof Film][]=[['overview','Overview',Film],['pulse','Prediction desk',Activity],['reviews','Community',MessageCircle]];

// ─── Mini Prediction Badge ─────────────────────────────────────────────────────
function MiniPredictionBadge({titleId}:{titleId:string}) {
  const [pred,setPred]=useState<Prediction|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    api<{prediction:Prediction}>(`/prediction/${titleId}`,'GET',undefined,controller.signal)
      .then(d=>setPred(d.prediction)).catch(()=>{});
    return()=>controller.abort();
  },[titleId]);
  if (!pred) return null;
  const isHit=pred.hitProbability>=55;
  return (
    <div className={`mini-pred-badge ${isHit?'mini-hit':'mini-flop'}`}>
      <Brain size={12}/>
      <span>CinePulse Forecast: {isHit?'Hit':'Flop'}</span>
      <strong>{pred.hitProbability}%</strong>
      {pred.revenueEstimate&&<span className="mini-rev">· {money(pred.revenueEstimate)}</span>}
    </div>
  );
}

// ─── Feature 1: Where to Watch ────────────────────────────────────────────────
function WhereToWatch({titleId}:{titleId:string}) {
  const [info,setInfo]=useState<WatchProviderInfo|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    api<{providers:WatchProviderInfo}>(`/providers/${titleId}`,'GET',undefined,controller.signal)
      .then(d=>setInfo(d.providers)).catch(()=>{});
    return()=>controller.abort();
  },[titleId]);

  if (!info) return null;
  const hasData=info.flatrate.length||info.rent.length||info.buy.length;
  if (!hasData) return (
    <div className="watch-section">
      <span className="eyebrow"><Tv2 size={12}/> WHERE TO WATCH</span>
      <p className="muted" style={{fontSize:10,marginTop:6}}>No streaming data available for your region ({info.region}). Check JustWatch for local options.</p>
    </div>
  );

  return (
    <div className="watch-section">
      <span className="eyebrow"><Tv2 size={12}/> WHERE TO WATCH · {info.region}</span>
      {info.flatrate.length>0&&(
        <div className="watch-group">
          <small>Stream</small>
          <div className="watch-providers">
            {info.flatrate.map(p=>(
              <div key={p.providerId} className="provider-badge" title={p.providerName}>
                {p.logoPath?<img src={p.logoPath} alt={p.providerName} loading="lazy"/>:<span>{p.providerName.slice(0,2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {info.rent.length>0&&(
        <div className="watch-group">
          <small>Rent</small>
          <div className="watch-providers">
            {info.rent.map(p=>(
              <div key={p.providerId} className="provider-badge" title={p.providerName}>
                {p.logoPath?<img src={p.logoPath} alt={p.providerName} loading="lazy"/>:<span>{p.providerName.slice(0,2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {info.buy.length>0&&(
        <div className="watch-group">
          <small>Buy</small>
          <div className="watch-providers">
            {info.buy.map(p=>(
              <div key={p.providerId} className="provider-badge" title={p.providerName}>
                {p.logoPath?<img src={p.logoPath} alt={p.providerName} loading="lazy"/>:<span>{p.providerName.slice(0,2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {info.link&&(
        <a href={info.link} target="_blank" rel="noreferrer" className="text-link" style={{fontSize:10,marginTop:4,display:'inline-flex',alignItems:'center',gap:4}}>
          <ShoppingBag size={10}/> All options on JustWatch <ExternalLink size={10}/>
        </a>
      )}
    </div>
  );
}

// ─── Feature 2: Similar & Recommended Strip ────────────────────────────────────
function SimilarStrip({titleId,label}:{titleId:string;label:string}) {
  const {openTitle}=useApp();
  const [items,setItems]=useState<Title[]|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    api<{items:Title[]}>(`/${label==='Similar'?'similar':'recommended'}/${titleId}`,'GET',undefined,controller.signal)
      .then(d=>setItems(d.items)).catch(()=>setItems([]));
    return()=>controller.abort();
  },[titleId,label]);
  if (!items||items.length===0) return null;
  return (
    <section className="similar-section">
      <span className="eyebrow">{label.toUpperCase()}</span>
      <div className="similar-strip">
        {items.map(t=>(
          <button key={t.id} className="similar-card" onClick={()=>openTitle(t.id)}>
            <div className="similar-poster">
              {t.poster?<img src={t.poster} alt="" loading="lazy"/>:<Clapperboard size={20}/>}
            </div>
            <div className="similar-info">
              <strong>{t.title}</strong>
              <span>{t.releaseDate?.slice(0,4)||'TBA'}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Main TitleDetail ──────────────────────────────────────────────────────────
export function TitleDetail({id,initialTab,onClose,onTabChange}:{id:string;initialTab:DetailTab;onClose:()=>void;onTabChange?:(tab:DetailTab)=>void}){
 const {library,save,remove,updateLibrary,busyIds,toast}=useApp();
 const prefersReduced = useReducedMotion();
 const [title,setTitle]=useState<Title|null>(null),[tab,setTab]=useState<DetailTab>(initialTab),[error,setError]=useState(''),[retry,setRetry]=useState(0),[personId,setPersonId]=useState<number|null>(null);
 const [pulsing, setPulsing] = useState(false);
 const [backdropLoaded, setBackdropLoaded] = useState(false);

 // Inline Diary State
 const [showDiaryPrompt, setShowDiaryPrompt] = useState(false);
 const [diaryDate, setDiaryDate] = useState(() => new Date().toISOString().slice(0, 10));
 const [diaryRating, setDiaryRating] = useState<number>(4);
 const [diaryNote, setDiaryNote] = useState('');
 const [diarySaving, setDiarySaving] = useState(false);

 const tabRefs=useRef<(HTMLButtonElement|null)[]>([]);
 useEffect(()=>setTab(initialTab),[initialTab]);
 useEffect(()=>{
   const controller=new AbortController();
   setTitle(null);
   setError('');
   setBackdropLoaded(false);
   api<{title:Title}>(`/title/${id}`,'GET',undefined,controller.signal)
     .then(d=>setTitle(d.title))
     .catch(e=>{if(e.name!=='AbortError')setError(e.message||'This title could not be loaded.');});
   return()=>controller.abort();
 },[id,retry]);

 useEffect(() => {
   if (!title?.backdrop) return;
   const img = new Image();
   img.src = title.backdrop;
   img.onload = () => setBackdropLoaded(true);
 }, [title?.backdrop]);

 function changeTab(next:DetailTab){setTab(next);onTabChange?.(next);}
 function tabKey(event:React.KeyboardEvent<HTMLButtonElement>,index:number){let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();const key=tabs[next][0];changeTab(key);tabRefs.current[next]?.focus();}
 const entry=library.find(e=>e.title.id===id);const released=!!title&&isReleased(title.releaseDate);const canViewStatus=released;

 function handleWatchlistClick() {
   if (entry) {
     remove(title!);
   } else {
     if (!prefersReduced) {
       setPulsing(true);
       setTimeout(() => setPulsing(false), 450);
     }
     save(title!);
   }
 }

 async function handleDiarySubmit(e: React.FormEvent) {
   e.preventDefault();
   if (!title) return;
   setDiarySaving(true);
   try {
     await updateLibrary(title, 'watched', diaryRating);
     if (diaryNote.trim()) {
       await api(`/reviews/${title.id}`, 'POST', {
         rating: diaryRating,
         body: diaryNote.trim(),
         spoiler: false
       });
     }
     setShowDiaryPrompt(false);
     toast('Logged to your cinema diary.');
   } catch (err: any) {
     toast(err?.message || 'Failed to save diary entry.');
   } finally {
     setDiarySaving(false);
   }
 }

 const [showCinemaMap, setShowCinemaMap] = useState(false);

 // Extract TMDB numeric person id from a cast member name lookup
 function openPerson(personIdNum:number){setPersonId(personIdNum);}

 return <>
  {personId!==null&&<PersonDetail personId={personId} onClose={()=>setPersonId(null)}/>}
  {showCinemaMap&&<Modal label={`Cinema Map · ${title?.title||'Film'}`} wide onClose={()=>setShowCinemaMap(false)}><CinemaMapView initialTitleId={id}/></Modal>}
  <Modal label={title?.title||'Title details'} wide onClose={onClose}>{error?<div className="modal-pad"><ErrorBox message={error} retry={()=>{setError('');setRetry(n=>n+1);}}/></div>:!title?<Loading/>:<>
  <div className={`detail-cover ${title.backdrop||title.poster?'':'detail-cover-empty'}`}>
    {title.poster && (
      <div
        className="detail-cover-layer poster"
        style={{ backgroundImage: `url("${title.poster}")` }}
      />
    )}
    {title.backdrop && (
      <div
        className={`detail-cover-layer backdrop ${backdropLoaded || prefersReduced ? 'loaded' : ''}`}
        style={{ backgroundImage: `url("${title.backdrop}")` }}
      />
    )}
    <div className="detail-cover-shade"/>
    {!title.backdrop&&!title.poster&&<Clapperboard className="detail-cover-placeholder" size={48} aria-label="Artwork unavailable"/>}
  <div className="detail-heading">
    <span className="eyebrow">{title.source==='demo'?'ORIGINAL CONCEPT':kindLabel(title).toUpperCase()} · {title.genres.slice(0,2).join(' / ')}</span>
    <h2>{title.title}</h2>
    <p>{title.tagline}</p>
    {title.status==='upcoming'&&<MiniPredictionBadge titleId={id}/>}
  </div></div>
  <div className="detail-content">
  <div className="detail-toolbar">
   <div className="detail-info">
    <span>{dateLabel(title.releaseDate)}</span>
    {title.runtime&&<span><Clock size={13}/>{Math.floor(title.runtime/60)}h {title.runtime%60}m</span>}
    {title.voteCount>0&&title.voteAverage!==null&&<span className="rating">★ {title.voteAverage.toFixed(1)} <small>TMDB · {title.voteCount.toLocaleString()} votes</small></span>}
   </div>
   <div className="detail-actions">
    <button type="button" className="button secondary small" onClick={()=>setShowCinemaMap(true)}><Compass size={14}/> Map</button>
    <button className={`button secondary small ${pulsing ? 'watchlist-pulse-active' : ''}`} onClick={handleWatchlistClick} disabled={busyIds.has(id)}>{entry?<Check size={16}/>:<Bookmark size={16}/>} {entry?'Remove from library':'Save to watchlist'}</button>
    {title.trailerKey&&/^[a-zA-Z0-9_-]{6,20}$/.test(title.trailerKey)&&<a className="button primary small" href={`https://www.youtube.com/watch?v=${encodeURIComponent(title.trailerKey)}`} target="_blank" rel="noreferrer"><Play size={15}/> Trailer <ArrowUpRight size={14}/></a>}
   </div>
  </div>


  {/* Phase 1 & 5: Unified CinePulse Score Card */}
  <div style={{ marginBottom: 20 }}>
    <CinePulseScoreCard titleId={id} />
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
     <div>
      <small>{title.mediaType==='tv'?'CREATOR / DIRECTOR':'DIRECTOR'}</small>
      {title.director && title.source==='tmdb' && title.directorId ? (
        <b className="clickable-name" onClick={()=>openPerson(title.directorId!)}>{title.director}</b>
      ) : (
        <b>{title.director||'Not listed'}</b>
      )}
     </div>
     <div><small>RELEASE STATUS</small><b>{title.status==='upcoming'?'Coming soon':released?'Released':'Unconfirmed'}</b></div>
     {title.budget&&<div><small>PRODUCTION BUDGET</small><b>{money(title.budget)}</b></div>}
     {title.revenue&&<div><small>ACTUAL REVENUE</small><b>{money(title.revenue)}</b></div>}
     <div><small>DATA SOURCE</small><b>{title.source==='demo'?'Fictional concept':'TMDB'}</b></div>
    </div>

    {/* Feature 1: Where to Watch */}
    {title.source==='tmdb'&&<WhereToWatch titleId={id}/>}
   </div>
   <aside className="journal-box glass"><Bookmark size={21}/><h3>Your cinema journal</h3><p>One place for your next watch and your all-time favourites.</p>
    <label>Library status<select aria-label="Library status" value={entry?.status||''} disabled={busyIds.has(id)} onChange={e=>{
      const val = e.target.value as 'watchlist'|'watching'|'watched';
      if (!val) return;
      updateLibrary(title, val);
      if (val === 'watched') setShowDiaryPrompt(true);
    }}>
     <option value="" disabled>Not in your library</option>
     <option value="watchlist">Want to watch</option>
     <option value="watching" disabled={!canViewStatus}>Currently watching</option>
     <option value="watched" disabled={!canViewStatus}>Watched</option>
    </select></label>
    {canViewStatus&&<label>Your private rating<select aria-label="Your private rating" value={entry?.rating??''} disabled={busyIds.has(id)} onChange={e=>{
      const r = e.target.value ? Number(e.target.value) : null;
      updateLibrary(title,'watched',r);
      if (r) setShowDiaryPrompt(true);
    }}>
     <option value="">Not rated</option>
     {[1,2,3,4,5].map(n=><option key={n} value={n}>{'★'.repeat(n)} · {n}/5</option>)}
    </select></label>}

    {(showDiaryPrompt || entry?.status === 'watched') && (
      <form className="diary-inline-composer" onSubmit={handleDiarySubmit}>
        <div className="diary-inline-title">
          <Clock size={13} />
          <span>Diary Log</span>
        </div>
        <div className="diary-inline-fields">
          <label style={{ margin: 0, fontSize: 10 }}>Watch Date
            <input
              type="date"
              aria-label="Diary watch date"
              value={diaryDate}
              onChange={e => setDiaryDate(e.target.value)}
              style={{ padding: '4px 6px', fontSize: 11, marginTop: 2 }}
            />
          </label>
          <label style={{ margin: 0, fontSize: 10 }}>Rating
            <select
              aria-label="Diary rating"
              value={diaryRating}
              onChange={e => setDiaryRating(Number(e.target.value))}
              style={{ padding: '4px 6px', fontSize: 11, marginTop: 2 }}
            >
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>{n} ★</option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          className="diary-inline-note"
          placeholder="Thoughts, memories, or where you watched (optional)…"
          rows={2}
          value={diaryNote}
          onChange={e => setDiaryNote(e.target.value)}
          maxLength={300}
        />
        <button
          type="submit"
          className="button primary small"
          disabled={diarySaving}
          style={{ alignSelf: 'flex-end', fontSize: 11, padding: '4px 10px' }}
        >
          {diarySaving ? 'Logging…' : 'Log to Diary'}
        </button>
      </form>
    )}

    <small>{canViewStatus?(title.mediaType==='tv'?'Watched is a title-level status. Rating here marks this title watched.':'Rating here marks this title watched. Share a review to make your opinion public.'):'This title has no confirmed past release date. Watchlist is available; watching and watched open after release.'}</small>
   </aside>
  </div>

  {/* Feature 3: Clickable Cast */}
  {title.cast.length>0?<section className="cast-section"><h3>The people behind the story</h3><div className="cast-list">{title.cast.map((c,i)=>{
    return <div className={`cast-person ${c.id?'cast-clickable':''}`} key={c.name+i} onClick={()=>{
      if (c.id) openPerson(c.id);
    }}>
      {c.profile?<img src={c.profile} alt="" loading="lazy"/>:<span><Users size={23}/></span>}
      <b>{c.name}</b><small>{c.character}</small>
    </div>;
  })}</div></section>:<p className="availability"><Users size={16}/> {title.source==='demo'?'Cast and trailers are not supplied for fictional concept titles.':'Cast information is not available.'}</p>}

  {title.mediaType==='tv'&&<Episodes title={title}/>}

  {/* Phase 4 & 5: Why This Movie? Recommendation Reasoning Engine */}
  <div style={{ marginTop: 24, marginBottom: 24 }}>
    <WhyThisMovie titleId={id} />
  </div>

  <button className="prediction-invite glass" onClick={()=>changeTab('pulse')}>
   <span className="signal-icon"><Brain size={22}/></span>
   <div>
    <span className="eyebrow mint">BEFORE OPENING NIGHT</span>
    <h3>CinePulse Forecast + your opening call.</h3>
    <p>See the model estimate, evidence availability, and make your own forecast.</p>
   </div>
   <ArrowUpRight size={23}/>
  </button>

  {title.source==='demo'&&<p className="fineprint">This title, release date, and artwork are fictional demonstration content.</p>}
  </div>}
  </div></div></>}</Modal>
 </>;
}

function Episodes({title}:{title:Title}){
 const [season,setSeason]=useState(1),[episodes,setEpisodes]=useState<{id:number;name:string;overview:string;episodeNumber:number;airDate:string|null;still:string|null}[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{if(!title.seasons)return;const controller=new AbortController();setEpisodes(null);setError('');api<{episodes:NonNullable<typeof episodes>}>(`/title/${title.id}/season/${season}`,'GET',undefined,controller.signal).then(d=>setEpisodes(d.episodes)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[title.id,title.seasons,season]);
 return <section className="episodes"><div className="section-heading compact"><h3>Seasons & episodes</h3>{!!title.seasons&&<select aria-label="Select season" value={season} onChange={e=>setSeason(Number(e.target.value))}>{Array.from({length:Math.min(100,title.seasons)},(_,i)=><option key={i} value={i+1}>Season {i+1}</option>)}</select>}</div>{!title.seasons?<p className="muted">No episode details are available for this title yet.</p>:error?<ErrorBox message={error}/>:episodes===null?<Loading/>:episodes.length===0?<p className="muted">No episodes reported in this season.</p>:<div className="episode-list">{episodes.map(e=><details key={e.id} className="episode"><summary><span>{String(e.episodeNumber).padStart(2,'0')}</span><b>{e.name}</b><small>{dateLabel(e.airDate)}</small></summary><div>{e.still&&<img src={e.still} alt="" loading="lazy"/>}<p>{e.overview||'No synopsis available.'}</p></div></details>)}</div>}</section>;
}

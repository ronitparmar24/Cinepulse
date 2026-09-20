'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Bookmark,Brain,Check,Clapperboard,Plus,TrendingDown,TrendingUp,X,AlertCircle,LoaderCircle} from 'lucide-react';
import type {Prediction,Title} from '@/lib/types';
import {useApp} from './Context';
import {api,kindLabel,year} from './client';
import {useReducedMotion} from './hooks/useReducedMotion';

export function Logo(){return <span className="logo"><span className="logo-bars"><i/><i/><i/></span>cinepulse<span className="mint">.</span></span>}

export function Modal({children,onClose,label,wide=false}:{children:React.ReactNode;onClose:()=>void;label:string;wide?:boolean}) {
 const ref=useRef<HTMLDialogElement>(null);const closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const el=ref.current;if(!el)return;
  const previous=document.activeElement as HTMLElement|null;
  if(!el.open) el.showModal();
  const original=document.body.style.overflow;document.body.style.overflow='hidden';
  closeRef.current?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key!=='Tab')return;
   const focusable=Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])')).filter(x=>x.offsetParent!==null);
   if(!focusable.length){event.preventDefault();return;}
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  el.addEventListener('keydown',keydown);
  return()=>{el.removeEventListener('keydown',keydown);if(el.open)el.close();document.body.style.overflow=original;if(previous?.isConnected)previous.focus();};
 },[]);
 return <dialog className={`modal ${wide?'wide':''}`} ref={ref} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}} aria-label={label}>
  <button ref={closeRef} className="icon close glass" onClick={onClose} aria-label="Close dialog"><X size={20}/></button><div className="modal-scroller">{children}</div>
 </dialog>;
}

export function ErrorBox({message,retry}:{message:string;retry?:()=>void}) {return <div className="error-box" role="alert"><AlertCircle size={19}/><div>{message}{retry&&<button className="text-link" onClick={retry}>Try again <ArrowUpRight size={14}/></button>}</div></div>}
export function Empty({icon:Icon=Clapperboard,title,children,action}:{icon?:typeof Clapperboard;title:string;children:React.ReactNode;action?:React.ReactNode}){return <div className="empty"><div className="empty-icon"><Icon size={26}/></div><h3>{title}</h3><p>{children}</p>{action}</div>}
export function Loading(){return <div className="loading" role="status" aria-live="polite"><LoaderCircle className="spin" size={24}/> A little cinema is on its way…</div>}

// ─── Poster with AI badge for upcoming titles ──────────────────────────────────

export function Poster({title,index=0}:{title:Title;index?:number}) {
 const {library,save,remove,openTitle,busyIds}=useApp();const saved=library.some(x=>x.title.id===title.id);
 // Lazy-load prediction for upcoming titles only
 const [pred,setPred]=useState<Prediction|null>(null);
 useEffect(()=>{
  if(title.status!=='upcoming')return;
  const controller=new AbortController();
  api<{prediction:Prediction}>(`/prediction/${title.id}`,'GET',undefined,controller.signal)
   .then(d=>setPred(d.prediction)).catch(()=>{});
  return()=>controller.abort();
 },[title.id,title.status]);

  const isHit = pred ? pred.hitProbability >= 55 : null;
  const [pulsing, setPulsing] = useState(false);
  const prefersReduced = useReducedMotion();

  const handleSaveToggle = () => {
    if (saved) {
      remove(title);
    } else {
      if (!prefersReduced) {
        setPulsing(true);
        setTimeout(() => setPulsing(false), 450);
      }
      save(title);
    }
  };

  return <article className="poster-card" style={{'--delay':`${index*35}ms`} as React.CSSProperties}>
   <div className="poster-image"><button className="poster-open" onClick={()=>openTitle(title.id)} aria-label={`Open ${title.title}`}>
    {title.poster?<img src={title.poster} alt="" loading="lazy" decoding="async" srcSet={title.source==='tmdb'&&title.poster.startsWith('https://image.tmdb.org/t/p/w500/')?`${title.poster.replace('/w500/','/w185/')} 185w, ${title.poster.replace('/w500/','/w342/')} 342w, ${title.poster} 500w`:undefined} sizes="(max-width: 700px) 42vw, (max-width: 1100px) 22vw, 180px" onError={e=>{e.currentTarget.style.visibility='hidden';'hidden';}}/>:<Clapperboard size={40} aria-hidden="true"/>}<span className="poster-shade"/>
    {title.source==='demo'&&<span className="poster-demo">CONCEPT</span>}
    {/* AI Prediction badge — upcoming movies only */}
    {pred && isHit !== null && (
      <span className={`poster-ai-badge ${isHit?'ai-hit':'ai-flop'}`} aria-label={`AI prediction: ${pred.hitProbability}% hit`}>
        <Brain size={9}/>
        {isHit?<TrendingUp size={9}/>:<TrendingDown size={9}/>}
        {pred.hitProbability}%
      </span>
    )}
    <span className="poster-view">Explore title <ArrowUpRight size={16}/></span>
   </button><span className="media-pill">{kindLabel(title)}</span><button className={`poster-save glass ${saved?'is-saved':''} ${pulsing ? 'watchlist-pulse-active' : ''}`} onClick={handleSaveToggle} disabled={busyIds.has(title.id)} aria-label={`${saved?'Remove':'Save'} ${title.title}`} aria-pressed={saved}>{saved?<Check size={16}/>:<Plus size={18}/>}</button></div>
   <button className="poster-title" onClick={()=>openTitle(title.id)}>{title.title}</button><div className="poster-meta"><span>{year(title)} <b>·</b> {title.genres[0]||kindLabel(title)}</span>{title.voteCount>0&&title.voteAverage!==null?<span className="rating">★ {title.voteAverage.toFixed(1)}</span>:<span className="mini-dot"/>}</div>
  </article>;
}

export function Methodology(){return <div className="methodology"><span className="eyebrow mint">THE CINEPULSE PROMISE</span><h2>Every number should<br/>have a story behind it.</h2><p>Community opinion is useful. Calling it a validated prediction is not. Here is exactly what this version measures.</p><div className="method-grid"><section><b>01 / Community outlook</b><p>The share of distinct accounts predicting "hit." One current vote per account. Your confidence does not give your vote extra weight.</p></section><section><b>02 / Uncertainty, visible</b><p>We show vote counts and a 95% Wilson interval. It describes a binomial poll under sampling assumptions—not a movie's probability of success. Self-selection and multiple accounts can bias the poll.</p></section><section><b>03 / No hindsight edits</b><p>Forecasts lock at the catalog release date, 00:00 UTC. Revisions made before release are timestamped. Missing dates cannot accept forecasts. Catalog dates may change or differ by market.</p></section><section><b>04 / AI model estimates</b><p>The heuristic model uses budget, genre, TMDB popularity, vote average, and release season to estimate revenue and hit probability. It is rule-based, not trained on licensed historical data, and carries explicit uncertainty bands.</p></section><section><b>05 / What is not connected</b><p>No trailer-view analysis, social scraping, paid sentiment feed, or live financial model. TMDB ratings are catalog ratings, not box-office evidence. AI outputs are estimates, never adjudicated outcomes.</p></section><section><b>06 / A responsible next step</b><p>To train a real model: license historical data, define market-specific success, preserve dated pre-release signals, and evaluate calibration on later releases. The current heuristic is not a substitute.</p></section></div></div>}

'use client';
import { titlePath } from '@/lib/slug';
import { ReleaseActions } from './ReleaseActions';
import { MyServicesBadge } from './ServicesPicker';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {
  Activity, ArrowUpRight, Bookmark, Brain, Check, Clapperboard, Clock,
  ExternalLink, Film, MessageCircle, MessageSquare, Newspaper, Play,
  ShoppingBag, Tv2, TrendingDown, TrendingUp, Users, Sparkles, Coins,
  Music, Ticket, Calendar, DollarSign, Tag, CheckCircle2, BookmarkCheck, Target
} from 'lucide-react';
import type {Prediction,Title,WatchProviderInfo} from '@/lib/types';
import {isReleased} from '@/lib/eligibility';
import {api,dateLabel,kindLabel,money} from './client';
import {useApp} from './Context';
import {ErrorBox,Loading,Modal} from './UI';
import {ForecastPanel} from './ForecastPanel';
import dynamic from 'next/dynamic';
import {TitleReviews} from './Reviews';
import {PersonDetail} from './PersonDetail';
import {CinePulseScoreCard} from './CinePulseScoreCard';
import {WhyThisMovie} from './WhyThisMovie';
import { useReducedMotion } from './hooks/useReducedMotion';
import { formatInrCrores } from '@/lib/currencyFormat';
import { AskTheCrew } from './AskTheCrew';
import { CinemaJournalSidebar } from './CinemaJournalTools';
import { OverviewHero, OverviewStory, spotlightMove, useAmbientColor, useScrollReveal } from './TitleOverview';
import { rememberTitle } from '@/lib/recentlyViewed';

const MultiverseLab = dynamic(() => import('./MultiverseLab').then(m => m.MultiverseLab), {
  ssr: false,
  loading: () => <div className="pad-card" style={{ textAlign: 'center', padding: 40 }}><Loading /></div>,
});

const TicketStubModal = dynamic(() => import('./TicketStubModal').then(m => m.TicketStubModal), {
  ssr: false,
});

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
  // The model withholds a call (hit = flop = 0, no revenue estimate) when evidence is thin;
  // showing that as "Flop 0%" read as a confident negative verdict.
  const withheld = pred.hitProbability + pred.flopProbability === 0 || (pred.revenueEstimate === null && pred.hitProbability === 0);
  if (withheld) {
    return (
      <div className="mini-pred-badge mini-withheld" title="Not enough public data (budget, tracking) for a responsible forecast yet">
        <Brain size={12}/>
        <span>CinePulse Forecast: withheld until more evidence</span>
      </div>
    );
  }
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
  const { region } = useApp();
  const [info,setInfo]=useState<WatchProviderInfo|null>(null);
  const [directSources, setDirectSources] = useState<Array<{ name: string; type: string; webUrl: string; format?: string | null; price?: number | null }>>([]);

  useEffect(()=>{
    const controller=new AbortController();
    const query = region ? `?region=${encodeURIComponent(region)}` : '';
    api<{providers:WatchProviderInfo; directSources?: any[]}>(`/providers/${titleId}${query}`,'GET',undefined,controller.signal)
      .then(d=>{
        setInfo(d.providers);
        if (Array.isArray(d.directSources)) setDirectSources(d.directSources);
      }).catch(()=>{});
    return()=>controller.abort();
  },[titleId, region]);

  if (!info && directSources.length === 0) return null;
  const hasData = (info?.flatrate.length || info?.rent.length || info?.buy.length || directSources.length > 0);

  if (!hasData) return (
    <div className="watch-section ovx-spot">
      <span className="eyebrow"><Tv2 size={12}/> WHERE TO WATCH · {info?.region || region}</span>
      <p className="muted" style={{fontSize:12,marginTop:6}}>No streaming data available for your region ({info?.region || region}).</p>
      <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginTop: 4 }}>
        Streaming availability via Watchmode & JustWatch
      </span>
    </div>
  );

  return (
    <div className="watch-section ovx-spot">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="eyebrow"><Tv2 size={12}/> WHERE TO WATCH · {info?.region || region}</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>Verified Watchmode & TMDB</span>
      </div>

      {/* Direct 1-Click Player Launch */}
      {directSources.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <small style={{ display: 'block', fontSize: 12, color: '#a7b3b9', marginBottom: 6, fontWeight: 700, letterSpacing: '0.8px' }}>
            VERIFIED DIRECT STREAM (1-CLICK)
          </small>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {directSources.slice(0, 4).map((ds, idx) => (
              <a
                key={idx}
                href={ds.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 650,
                  textDecoration: 'none',
                  background: ds.type === 'sub' ? 'rgba(0, 245, 155, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                  border: ds.type === 'sub' ? '1px solid rgba(0, 245, 155, 0.35)' : '1px solid rgba(255, 255, 255, 0.12)',
                  color: ds.type === 'sub' ? 'var(--neon-mint)' : '#f1f5f9',
                  transition: 'transform 0.15s, border-color 0.15s',
                }}
              >
                <Play size={10} fill="currentColor" />
                <span>Watch on {ds.name}</span>
                {ds.format && <span style={{ opacity: 0.7, fontSize: 12 }}>· {ds.format}</span>}
                {ds.price && <span style={{ opacity: 0.85, fontSize: 12, color: '#fbbf24' }}>₹{ds.price}</span>}
                <ExternalLink size={10} style={{ opacity: 0.6 }} />
              </a>
            ))}
          </div>
        </div>
      )}

      {info?.flatrate && info.flatrate.length > 0 && (
        <div className="watch-group">
          <small>Subscription</small>
          <div className="watch-providers">
            {info.flatrate.map(p => (
              <div key={p.providerId} className="provider-badge" title={p.providerName}>
                {p.logoPath ? <img src={p.logoPath} alt={p.providerName} loading="lazy" /> : <span>{p.providerName.slice(0, 2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {info?.rent && info.rent.length > 0 && (
        <div className="watch-group">
          <small>Rent</small>
          <div className="watch-providers">
            {info.rent.map(p => (
              <div key={p.providerId} className="provider-badge" title={p.providerName}>
                {p.logoPath ? <img src={p.logoPath} alt={p.providerName} loading="lazy" /> : <span>{p.providerName.slice(0, 2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {info?.buy && info.buy.length > 0 && (
        <div className="watch-group">
          <small>Buy</small>
          <div className="watch-providers">
            {info.buy.map(p => (
              <div key={p.providerId} className="provider-badge" title={p.providerName}>
                {p.logoPath ? <img src={p.logoPath} alt={p.providerName} loading="lazy" /> : <span>{p.providerName.slice(0, 2)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {info?.link && (
        <a href={info.link} target="_blank" rel="noreferrer" className="text-link" style={{fontSize:12,marginTop:6,display:'inline-flex',alignItems:'center',gap:4}}>
          <ShoppingBag size={10}/> All global options on JustWatch <ExternalLink size={10}/>
        </a>
      )}
    </div>
  );
}

// ─── Theatrical Breakeven Meter (2.5x Rule) ────────────────────────────────────
function TheatricalBreakevenMeter({
  budget,
  revenue,
  currencyInfo,
}: {
  budget?: number | null;
  revenue?: number | null;
  currencyInfo?: { rates: { INR: number }; date: string } | null;
}) {
  // Hooks first: React needs the same hooks in the same order on every render,
  // so the "no budget" early return must come after them.
  const hasBudget = typeof budget === 'number' && budget > 0;
  const breakeven = hasBudget ? budget * 2.5 : 0;
  const hasRevenue = typeof revenue === 'number' && revenue > 0;
  const maxVal = Math.max(breakeven, revenue || 0) * 1.15 || 1;
  const breakevenPct = Math.min(100, Math.round((breakeven / maxVal) * 100));
  const revenuePct = hasRevenue ? Math.min(100, Math.round((revenue / maxVal) * 100)) : 0;
  const [fillPct, setFillPct] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setFillPct(revenuePct), 80);
    return () => clearTimeout(timer);
  }, [revenuePct]);

  if (!hasBudget) return null;

  const isProfitable = hasRevenue && revenue >= breakeven;
  const isRecouped = hasRevenue && revenue >= budget && revenue < breakeven;
  const isDeficit = hasRevenue && revenue < budget;

  const multiple = hasRevenue ? (revenue / breakeven).toFixed(2) : null;
  const roiPct = hasRevenue ? Math.round(((revenue - budget) / budget) * 100) : null;

  return (
    <div className="breakeven-meter-refined glass ovx-spot">
      <div className="breakeven-header-refined">
        <div className="breakeven-title-left">
          <Coins size={14} className="mint" />
          <span className="breakeven-title-text">
            THEATRICAL BREAKEVEN · 2.5× INDUSTRY RULE
          </span>
        </div>
        <div className="breakeven-status-pill-wrap">
          {isProfitable ? (
            <span className="breakeven-status-tag tag-profitable">
              ★ PROFITABLE ({multiple}× Recouped)
            </span>
          ) : isRecouped ? (
            <span className="breakeven-status-tag tag-recouped">
              PRODUCTION RECOUPED ({multiple}×)
            </span>
          ) : isDeficit ? (
            <span className="breakeven-status-tag tag-deficit">
              THEATRICAL DEFICIT ({multiple}×)
            </span>
          ) : (
            <span className="breakeven-status-tag tag-neutral">
              BREAKEVEN TARGET: {money(breakeven)}
            </span>
          )}
        </div>
      </div>

      <p className="breakeven-explainer-text">
        In global theatrical distribution, exhibition splits (~50%) and marketing require films to gross roughly <strong>2.5× their production budget</strong> to achieve true theatrical breakeven.
      </p>

      {/* Visual Recoupment Gauge with non-colliding milestone chips */}
      <div className="breakeven-gauge-wrap">
        <div className="breakeven-milestones-row ovx-milestones">
          <span className="milestone-chip budget">Budget: {money(budget)}</span>
          <span className="milestone-chip target">
            ★ 2.5× Target: {money(breakeven)}
          </span>
        </div>

        <div className="breakeven-track-refined" role="progressbar" aria-valuenow={hasRevenue ? revenuePct : 0} aria-valuemin={0} aria-valuemax={100}>
          {hasRevenue && (
            <div
              className="breakeven-fill-refined"
              style={{
                width: `${fillPct}%`,
                background: isProfitable
                  ? 'linear-gradient(90deg, #10b981, #00f59b)'
                  : isRecouped
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #f43f5e, #fb7185)',
              }}
            />
          )}

          <div
            className="breakeven-notch-marker"
            style={{ left: `${breakevenPct}%` }}
            title={`2.5× Breakeven Milestone: ${money(breakeven)}`}
          >
            <div className="notch-line" />
            <div className="notch-diamond" />
          </div>
        </div>
      </div>

      {/* Financial Comparison Row */}
      <div className="breakeven-financial-grid">
        <div className="fin-metric-card">
          <div className="fin-metric-head">
            <Coins size={12} className="muted" />
            <span>PRODUCTION BUDGET</span>
          </div>
          <strong className="fin-metric-val mono">{money(budget)}</strong>
          {currencyInfo && (
            <div className="fin-metric-sub mono">
              {formatInrCrores(budget, currencyInfo.rates.INR, currencyInfo.date)}
            </div>
          )}
        </div>

        <div className="fin-metric-card highlight-target">
          <div className="fin-metric-head">
            <Target size={12} className="amber" />
            <span className="amber">2.5× BREAKEVEN TARGET</span>
          </div>
          <strong className="fin-metric-val mono amber">{money(breakeven)}</strong>
          {currencyInfo && (
            <div className="fin-metric-sub mono">
              {formatInrCrores(breakeven, currencyInfo.rates.INR, currencyInfo.date)}
            </div>
          )}
        </div>

        <div className={`fin-metric-card ${isProfitable ? 'highlight-profit' : ''}`}>
          <div className="fin-metric-head">
            <TrendingUp size={12} className={isProfitable ? 'mint' : 'muted'} />
            <span>WORLDWIDE BOX OFFICE</span>
          </div>
          <strong className={`fin-metric-val mono ${hasRevenue ? (isProfitable ? 'mint' : 'coral') : 'muted'}`}>
            {hasRevenue ? money(revenue!) : 'Pending Release'}
          </strong>
          {hasRevenue && (
            <div className={`fin-metric-sub mono ${isProfitable ? 'mint' : 'coral'}`}>
              {multiple}× Multiplier {roiPct !== null ? `(${roiPct > 0 ? `+${roiPct}%` : `${roiPct}%`} ROI)` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Official Motion Picture Soundtrack Hub ───────────────────────────────────
function SoundtrackHub({ titleName }: { titleName: string }) {
  const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(titleName + ' soundtrack')}`;
  const appleUrl = `https://music.apple.com/us/search?term=${encodeURIComponent(titleName + ' soundtrack')}`;
  const ytUrl = `https://music.youtube.com/search?q=${encodeURIComponent(titleName + ' original motion picture soundtrack')}`;

  return (
    <div
      className="glass ovx-ost ovx-spot"
      style={{
        marginTop: 20,
        marginBottom: 20,
        padding: '16px 20px',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(16,185,129,0.03))',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Music size={14} className="mint" />
          <span className="eyebrow mint" style={{ fontSize: 12 }}>
            OFFICIAL SOUNDTRACK &amp; ORIGINAL SCORE
          </span>
        </div>
        <div className="eq-bars" title="Animated Audio Equalizer">
          <div className="eq-bar" />
          <div className="eq-bar" />
          <div className="eq-bar" />
          <div className="eq-bar" />
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, margin: '0 0 14px', lineHeight: 1.5 }}>
        Stream the official orchestral motion picture score, main themes, and licensed tracks:
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button glass small ost-launcher-link"
          style={{ fontSize: 12, padding: '6px 14px', gap: 7 }}
        >
          <div className="eq-bars">
            <div className="eq-bar" style={{ background: '#1db954' }} />
            <div className="eq-bar" style={{ background: '#1db954' }} />
            <div className="eq-bar" style={{ background: '#1db954' }} />
            <div className="eq-bar" style={{ background: '#1db954' }} />
          </div>
          <span>Spotify OST</span>
          <ExternalLink size={10} style={{ opacity: 0.7 }} />
        </a>

        <a
          href={appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button glass small ost-launcher-link"
          style={{ fontSize: 12, padding: '6px 14px', gap: 7 }}
        >
          <div className="eq-bars">
            <div className="eq-bar" style={{ background: '#fa2d48' }} />
            <div className="eq-bar" style={{ background: '#fa2d48' }} />
            <div className="eq-bar" style={{ background: '#fa2d48' }} />
            <div className="eq-bar" style={{ background: '#fa2d48' }} />
          </div>
          <span>Apple Music Score</span>
          <ExternalLink size={10} style={{ opacity: 0.7 }} />
        </a>

        <a
          href={ytUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button glass small ost-launcher-link"
          style={{ fontSize: 12, padding: '6px 14px', gap: 7 }}
        >
          <div className="eq-bars">
            <div className="eq-bar" style={{ background: '#f43f5e' }} />
            <div className="eq-bar" style={{ background: '#f43f5e' }} />
            <div className="eq-bar" style={{ background: '#f43f5e' }} />
            <div className="eq-bar" style={{ background: '#f43f5e' }} />
          </div>
          <span>YouTube Music</span>
          <ExternalLink size={10} style={{ opacity: 0.7 }} />
        </a>
      </div>
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

// ─── Feature 2b: In The News (Press Coverage) ─────────────────────────────────
function InTheNews({titleId}:{titleId:string}) {
  const [articles,setArticles]=useState<Array<{title:string;source:string;url:string;publishedAt:string}>>([]);
  useEffect(()=>{
    const controller=new AbortController();
    api<{news:Array<{title:string;source:string;url:string;publishedAt:string}>}>(`/title/${titleId}/news`,'GET',undefined,controller.signal)
      .then(d=>{
        if(d&&Array.isArray(d.news))setArticles(d.news.slice(0,3));
      }).catch(()=>{});
    return()=>controller.abort();
  },[titleId]);

  if(!articles||articles.length===0)return null;

  return (
    <section className="in-the-news-section glass" style={{marginTop:24,padding:'16px 20px',borderRadius:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
        <span className="eyebrow mint" style={{display:'flex',alignItems:'center',gap:6}}>
          <Newspaper size={13}/> IN THE NEWS · PRESS COVERAGE
        </span>
        <span style={{fontSize:12,color:'var(--muted, #94a3b8)'}}>Via GNews (Batch Cached)</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {articles.map((item,idx)=>(
          <a
            key={idx}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:'flex',
              justifyContent:'space-between',
              alignItems:'baseline',
              gap:12,
              textDecoration:'none',
              color:'inherit',
              padding:'8px 12px',
              borderRadius:8,
              background:'rgba(255, 255, 255, 0.04)',
              transition:'background 0.2s',
            }}
          >
            <div>
              <div style={{fontSize:13,fontWeight:500,lineHeight:1.4,color:'#f1f5f9'}}>{item.title}</div>
              <small style={{fontSize:12,color:'var(--muted, #94a3b8)'}}>{item.source} · {dateLabel(item.publishedAt)}</small>
            </div>
            <ExternalLink size={13} style={{flexShrink:0,opacity:0.6}}/>
          </a>
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

 const [diarySaving, setDiarySaving] = useState(false);
 const [currencyInfo, setCurrencyInfo] = useState<{ rates: { INR: number }; date: string } | null>(null);

 const tabRefs=useRef<(HTMLButtonElement|null)[]>([]);
 const tabListRef=useRef<HTMLDivElement|null>(null);
 const contentRef=useRef<HTMLDivElement|null>(null);
 const [indicator,setIndicator]=useState<{x:number;w:number}|null>(null);
 useEffect(()=>setTab(initialTab),[initialTab]);
 useEffect(() => {
   const controller = new AbortController();
   api<{ rates: { INR: number }; date: string }>('/currency', 'GET', undefined, controller.signal)
     .then(setCurrencyInfo)
     .catch(() => {});
   return () => controller.abort();
 }, []);
 useEffect(()=>{
   const controller=new AbortController();
   setTitle(null);
   setError('');
   setBackdropLoaded(false);
   api<{title:Title}>(`/title/${id}`,'GET',undefined,controller.signal)
     .then(d=>{setTitle(d.title);rememberTitle(d.title);})
     .catch(e=>{if(e.name!=='AbortError')setError(e.message||'This title could not be loaded.');});
   return()=>controller.abort();
 },[id,retry]);

 const [heroArtwork, setHeroArtwork] = useState<{ logoUrl: string | null; backgroundUrl: string | null } | null>(null);

 useEffect(() => {
   if (!id || !title) return;
   const controller = new AbortController();
   api<{ logoUrl: string | null; backgroundUrl: string | null }>(`/artwork/${id}?title=${encodeURIComponent(title.title)}`, 'GET', undefined, controller.signal)
     .then(setHeroArtwork)
     .catch(() => {});
   return () => controller.abort();
 }, [id, title?.title]);

 useEffect(() => {
   const bg = heroArtwork?.backgroundUrl || title?.backdrop;
   if (!bg) return;
   const img = new Image();
   img.src = bg;
   img.onload = () => setBackdropLoaded(true);
 }, [heroArtwork?.backgroundUrl, title?.backdrop]);

 const ambient = useAmbientColor(title?.poster || title?.backdrop);

 // Sliding underline: measure the active tab and glide the indicator to it.
 useLayoutEffect(() => {
   const measure = () => {
     const index = tabs.findIndex(([key]) => key === tab);
     const el = tabRefs.current[index];
     if (el) setIndicator({ x: el.offsetLeft, w: el.offsetWidth });
   };
   measure();
   window.addEventListener('resize', measure);
   return () => window.removeEventListener('resize', measure);
 }, [tab, title]);

 // Overview blocks rise in as they scroll into view.
 useScrollReveal(contentRef, prefersReduced, [tab, title?.id]);

 function changeTab(next:DetailTab){setTab(next);onTabChange?.(next);}
 function tabKey(event:React.KeyboardEvent<HTMLButtonElement>,index:number){let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();const key=tabs[next][0];changeTab(key);tabRefs.current[next]?.focus();}
 const entry=library.find(e=>e.title.id===id);const released=!!title&&isReleased(title.releaseDate);const canViewStatus=released;

 function handleWatchlistClick() {
   if (entry) {
     void remove(title!);
   } else {
     if (!prefersReduced) {
       setPulsing(true);
       setTimeout(() => setPulsing(false), 450);
     }
     void save(title!);
   }
 }  async function handleLogDiary(rating: number | null, note: string, date: string) {
    if (!title) return;
    setDiarySaving(true);
    try {
      // One dated diary entry per viewing (rewatches are detected by the server).
      const res = await api<{ entry: { rewatch: boolean } }>(`/diary/${title.id}`, 'POST', { watchedOn: date, rating, note: note.trim() || undefined });
      // Keep the client's library in step; never clear an existing rating when logging without one.
      await updateLibrary(title, 'watched', rating ?? entry?.rating ?? null);
      if (note.trim()) {
        await api(`/reviews/${title.id}`, 'POST', {
          rating,
          body: note.trim(),
          spoiler: false,
        });
      }
      toast(res.entry.rewatch ? 'Rewatch logged to your diary.' : 'Logged to your diary.');
    } catch (err: any) {
      toast(err?.message || 'Failed to save diary entry.');
    } finally {
      setDiarySaving(false);
    }
  }

  const [showMultiverse, setShowMultiverse] = useState(false);
  const [showTicketStub, setShowTicketStub] = useState(false);
  const [ticketStubCustom, setTicketStubCustom] = useState<{ format?: string; seat?: string }>({});

 // Extract TMDB numeric person id from a cast member name lookup
 function openPerson(personIdNum:number){setPersonId(personIdNum);}

 return <>
  {personId!==null&&<PersonDetail personId={personId} onClose={()=>setPersonId(null)}/>}
  {showMultiverse&&title&&<Modal label={`Box Office Multiverse · ${title.title}`} wide onClose={()=>setShowMultiverse(false)}><MultiverseLab title={title} onClose={()=>setShowMultiverse(false)}/></Modal>}
  {showTicketStub&&title&&(
    <TicketStubModal
      data={{
        titleName: title.title,
        serialNumber: `CP-TK-${title.id.replace(/^(movie|tv)-/, '').slice(0, 8).toUpperCase()}`,
        verdict: entry?.rating ? 'called' : 'verified',
        releaseYear: title.releaseDate?.slice(0, 4),
        format: ticketStubCustom.format || 'DOLBY ATMOS · 4K LASER',
        seat: ticketStubCustom.seat || 'ROW D · SEAT 14',
        stats: [
          { label: 'RUNTIME', value: title.runtime ? `${title.runtime}m` : 'Feature' },
          { label: 'YOUR RATING', value: entry?.rating ? `${entry.rating} ★` : 'Logged' },
          { label: 'SOURCE', value: title.source === 'demo' ? 'Concept' : 'TMDB' },
        ],
      }}
      onClose={() => setShowTicketStub(false)}
    />
  )}
  <Modal label={title?.title||'Title details'} wide onClose={onClose}>{error?<div className="modal-pad"><ErrorBox message={error} retry={()=>{setError('');setRetry(n=>n+1);}}/></div>:!title?<Loading/>:<>
  <OverviewHero
    title={title}
    logoUrl={heroArtwork?.logoUrl}
    backdropLoaded={backdropLoaded}
    reducedMotion={prefersReduced}
    ambient={ambient}
  >
    {title.status==='upcoming'&&<MiniPredictionBadge titleId={id}/>}
  </OverviewHero>
  <div
    className="detail-content ovx-content"
    ref={contentRef}
    onPointerMove={spotlightMove}
    style={ambient ? ({ '--ambient': ambient } as CSSProperties) : undefined}
  >
  {/* Blurred, pinned copy of the artwork: gives the frosted-glass cards real colour to blur. */}
  {(title.backdrop||title.poster)&&<div className="ovx-ambient-layer" aria-hidden="true" style={{ backgroundImage: `url("${title.backdrop||title.poster}")` }} />}
  <div className="detail-toolbar ovx-toolbar">
   <MyServicesBadge titleId={id}/>
   <div className="detail-actions">
    {title.trailerKey&&/^[a-zA-Z0-9_-]{6,20}$/.test(title.trailerKey)&&<a className="ovx-action ovx-action-primary" href={`https://www.youtube.com/watch?v=${encodeURIComponent(title.trailerKey)}`} target="_blank" rel="noreferrer"><span className="ovx-action-play"><Play size={12} fill="currentColor"/></span> Watch trailer <ArrowUpRight size={14}/></a>}
    <button className={`ovx-action ovx-action-save ${entry ? 'is-saved' : ''} ${pulsing ? 'watchlist-pulse-active' : ''}`} onClick={handleWatchlistClick} disabled={busyIds.has(id)} aria-pressed={!!entry}>{entry?<BookmarkCheck size={15}/>:<Bookmark size={15}/>} {entry?'In your library':'Save to watchlist'}</button>
    <button
      type="button"
      className="ovx-action ovx-action-ai"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cinepulse:open-chat', { detail: { titleId: id, titleName: title.title } }));
        }
      }}
      aria-label={`Ask CinePulse about ${title.title}`}
    >
      <MessageSquare size={14} /> Ask CinePulse
    </button>
    <ReleaseActions title={title}/>
    <button type="button" className="ovx-action ovx-action-lab" onClick={()=>setShowMultiverse(true)}>
      <Sparkles size={14} /> Multiverse Lab
    </button>
    <a className="ovx-action ovx-action-ghost" href={titlePath(title)} title="Open the shareable page for this title">Full page <ArrowUpRight size={14}/></a>
   </div>
  </div>


  {/* Phase 1 & 5: Unified CinePulse Score Card */}
  <div style={{ marginBottom: 20 }} data-reveal>
    <CinePulseScoreCard titleId={id} />
  </div>

  <div
    className="detail-tabs ovx-tabs"
    role="tablist"
    aria-label="Title sections"
    aria-orientation="horizontal"
    ref={tabListRef}
    style={indicator ? ({ '--ind-x': `${indicator.x}px`, '--ind-w': `${indicator.w}px` } as CSSProperties) : undefined}
  >
   {tabs.map(([key,label,Icon],index)=><button key={key} ref={node=>{tabRefs.current[index]=node}} id={`tab-${key}-${id}`} role="tab" type="button" aria-selected={tab===key} aria-controls={`panel-${key}-${id}`} tabIndex={tab===key?0:-1} className={tab===key?'active':''} onKeyDown={e=>tabKey(e,index)} onClick={()=>changeTab(key)}><Icon size={16}/>{label}{key==='pulse'&&<span className="pulse-tab-dot"/>}</button>)}
   <span className={`ovx-tab-indicator ${indicator ? 'is-ready' : ''}`} aria-hidden="true" />
  </div>

  <div role="tabpanel" tabIndex={0} id={`panel-${tab}-${id}`} aria-labelledby={`tab-${tab}-${id}`} key={tab} className="ovx-panel">
  {tab==='pulse'?<ForecastPanel title={title}/>:tab==='reviews'?<TitleReviews title={title}/>:
  <div className="overview"><div className="overview-grid">
   <div>
    <OverviewStory
      title={title}
      released={released}
      currencyInfo={currencyInfo}
      reducedMotion={prefersReduced}
      onOpenPerson={openPerson}
    />

    {/* Theatrical Breakeven & ROI Multiplier */}
    <div data-reveal><TheatricalBreakevenMeter budget={title.budget} revenue={title.revenue} currencyInfo={currencyInfo} /></div>

    {/* Feature 1: Where to Watch */}
    {title.source==='tmdb'&&<div data-reveal><WhereToWatch titleId={id}/></div>}

    {/* Official Motion Picture Soundtrack Hub */}
    <div data-reveal><SoundtrackHub titleName={title.title} /></div>
   </div>

    {/* Redefined Cinema Journal Sidebar */}
    <div className="ovx-side" data-reveal>
    <CinemaJournalSidebar
      title={title}
      entry={entry}
      canViewStatus={canViewStatus}
      busy={busyIds.has(id)}
      diarySaving={diarySaving}
      onUpdateStatus={(st) => updateLibrary(title, st)}
      onUpdateRating={(r) => updateLibrary(title, 'watched', r)}
      onLogDiary={handleLogDiary}
      onOpenTicketStub={() => setShowTicketStub(true)}
    />
    </div>
   </div>

  {/* Feature 3: Clickable Cast */}
  {title.cast.length>0?<section className="cast-section ovx-fullcast" data-reveal aria-label="Full cast">
    <div className="ovx-section-head">
      <span className="ovx-eyebrow"><Users size={13} aria-hidden="true"/> The people behind the story</span>
      <span className="ovx-count">{title.cast.length} credited</span>
    </div>
    <div className="ovx-cast-scroller">
      {title.cast.map((c,i)=>{
        const inner=<>
          <span className="ovx-cast-photo">{c.profile?<img src={c.profile} alt="" loading="lazy"/>:<Users size={24} aria-hidden="true"/>}</span>
          <span className="ovx-cast-meta"><b>{c.name}</b><small>{c.character||'Cast'}</small></span>
        </>;
        return c.id
          ? <button type="button" key={c.name+i} className="ovx-cast-card" style={{'--i':Math.min(i,10)} as CSSProperties} onClick={()=>openPerson(c.id!)} aria-label={`${c.name} as ${c.character||'cast'}. Open filmography`}>{inner}</button>
          : <div key={c.name+i} className="ovx-cast-card" style={{'--i':Math.min(i,10)} as CSSProperties}>{inner}</div>;
      })}
    </div>
  </section>:<p className="availability"><Users size={16}/> {title.source==='demo'?'Cast and trailers are not supplied for fictional concept titles.':'Cast information is not available.'}</p>}

  {title.mediaType==='tv'&&<Episodes title={title}/>}

  {/* Phase 4 & 5: Why This Movie? Recommendation Reasoning Engine */}
  <div style={{ marginTop: 24, marginBottom: 24 }} data-reveal>
    <WhyThisMovie titleId={id} />
  </div>

  {/* Track W: Ask the Crew signature component */}
  <div style={{ marginTop: 24, marginBottom: 24 }} data-reveal>
    <AskTheCrew titleId={id} />
  </div>

  {/* Step 2: In the News widget (batch-cached press coverage) */}
  <InTheNews titleId={id} />

  <button className="prediction-invite glass ovx-spot" data-reveal onClick={()=>changeTab('pulse')}>
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

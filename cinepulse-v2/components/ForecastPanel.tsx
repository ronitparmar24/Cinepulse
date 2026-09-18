'use client';
import {useEffect,useState} from 'react';
import {Activity,ArrowRight,BarChart3,Brain,Check,CheckCircle2,Clock3,Info,LockKeyhole,Minus,Sparkles,TrendingDown,TrendingUp,Zap} from 'lucide-react';
import type {Prediction,Pulse,Title} from '@/lib/types';
import {api,dateLabel,money} from './client';
import {useApp} from './Context';
import {ErrorBox,Loading} from './UI';

// ─── AI Prediction Card ────────────────────────────────────────────────────────

function ConfidenceLabel({confidence}:{confidence:Prediction['confidence']}) {
  const map:{[k:string]:{label:string;cls:string}} = {
    'high':     {label:'High confidence',    cls:'conf-high'},
    'medium':   {label:'Medium confidence',  cls:'conf-med'},
    'low':      {label:'Low confidence',     cls:'conf-low'},
    'very-low': {label:'Very low confidence',cls:'conf-vlow'},
  };
  const {label,cls} = map[confidence] ?? {label:'Unknown',cls:''};
  return <span className={`conf-badge ${cls}`}>{label}</span>;
}

function ImpactIcon({impact}:{impact:'positive'|'neutral'|'negative'}) {
  if (impact==='positive') return <TrendingUp size={13} className="factor-pos"/>;
  if (impact==='negative') return <TrendingDown size={13} className="factor-neg"/>;
  return <Minus size={13} className="factor-neu"/>;
}

function PredictionCard({title}:{title:Title}) {
  const [pred,setPred]=useState<Prediction|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setError('');
    api<{prediction:Prediction}>(`/prediction/${title.id}`,'GET',undefined,controller.signal)
      .then(d=>setPred(d.prediction))
      .catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return()=>controller.abort();
  },[title.id]);

  if (error) return <div className="ai-card glass ai-card-error"><Brain size={20}/><p>Prediction unavailable: {error}</p></div>;
  if (!pred) return <div className="ai-card glass ai-card-loading"><div className="spin"><Sparkles size={18}/></div><span>Computing model prediction…</span></div>;

  const isTv = title.mediaType==='tv';
  const hitW = pred.hitProbability;
  const flopW = pred.flopProbability;
  const isHit = pred.hitProbability >= 55;

  return (
    <div className="ai-card glass">
      <div className="ai-card-header">
        <span className="ai-badge"><Brain size={14}/> AI MODEL ESTIMATE</span>
        <ConfidenceLabel confidence={pred.confidence}/>
      </div>

      {/* Hit/Flop probability meter */}
      <div className="ai-meter-wrap">
        <div className="ai-meter-labels">
          <span className="ai-hit-label"><TrendingUp size={13}/> HIT</span>
          <span className="ai-flop-label">FLOP <TrendingDown size={13}/></span>
        </div>
        <div className="ai-meter" role="img" aria-label={`Model prediction: ${hitW}% hit, ${flopW}% flop`}>
          <div className="ai-meter-hit" style={{width:`${hitW}%`}}>
            {hitW >= 30 && <span>{hitW}%</span>}
          </div>
          <div className="ai-meter-flop" style={{width:`${flopW}%`}}>
            {flopW >= 20 && <span>{flopW}%</span>}
          </div>
        </div>
        <div className="ai-verdict">
          <span className={isHit?'verdict-hit':'verdict-flop'}>
            {isHit ? <><TrendingUp size={16}/> Predicted {isTv?'audience hit':'box-office hit'}</> : <><TrendingDown size={16}/> Predicted {isTv?'underperformer':'underperformer'}</>}
          </span>
          <small>{pred.hitProbability}% hit probability from model signals</small>
        </div>
      </div>

      {/* Revenue estimate — movies only */}
      {!isTv && (
        <div className="ai-revenue">
          <div className="ai-revenue-label"><Zap size={13}/> REVENUE FORECAST</div>
          {pred.revenueEstimate !== null ? (
            <div className="ai-revenue-value">
              <strong>{money(pred.revenueEstimate)}</strong>
              {pred.revenueRange && (
                <span className="ai-revenue-range">
                  Range: {money(pred.revenueRange[0])} – {money(pred.revenueRange[1])}
                </span>
              )}
            </div>
          ) : (
            <p className="ai-revenue-missing">Insufficient budget/metadata for revenue estimate</p>
          )}
        </div>
      )}

      {/* Key signal factors */}
      <div className="ai-factors">
        <div className="ai-factors-label">Key signals</div>
        {pred.factors.map((f,i)=>(
          <div className="ai-factor" key={i}>
            <ImpactIcon impact={f.impact}/>
            <span>{f.label}</span>
          </div>
        ))}
      </div>

      <p className="ai-disclaimer"><Info size={11}/> {pred.disclaimer}</p>
    </div>
  );
}

// ─── Main ForecastPanel ────────────────────────────────────────────────────────

export function ForecastPanel({title}:{title:Title}){
 const {user,needAuth,toast}=useApp();const [pulse,setPulse]=useState<Pulse|null>(null),[error,setError]=useState(''),[choice,setChoice]=useState<'hit'|'flop'>('hit'),[confidence,setConfidence]=useState(65),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');api<{pulse:Pulse}>(`/pulse/${title.id}`,'GET',undefined,controller.signal).then(({pulse:p})=>{setPulse(p);if(p.myForecast){setChoice(p.myForecast.choice);setConfidence(p.myForecast.confidence);setReason(p.myForecast.reason);}}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[title.id,user?.id,revision]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!needAuth())return;setBusy(true);setError('');try{await api(`/pulse/${title.id}`,'POST',{choice,confidence,reason});setRevision(r=>r+1);toast('Your call is saved, with a timestamp.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!pulse)return error?<ErrorBox message={error} retry={()=>setRevision(r=>r+1)}/>:<Loading/>;
 const isTv=title.mediaType==='tv';const share=pulse.hitShare===null?null:Math.round(pulse.hitShare*100);const maxHistory=Math.max(1,...pulse.history.map(h=>h.count));
 return <div className="forecast-panel">
  {/* Disclaimer notice */}
  <div className="forecast-notice"><Info size={17}/><span>{isTv?'Audience-reception outlook for a series. Not a renewal or profitability prediction.':'Community opinions on theatrical success. Not a trained model or a financial forecast.'}</span></div>

  {/* ── AI Prediction Card ─────────────────────────────────────────────────── */}
  <div className="ai-section">
    <div className="section-heading compact ai-section-heading">
      <div>
        <span className="eyebrow mint"><Brain size={13}/> AI PREDICTION ENGINE</span>
        <h3>What the model sees.</h3>
        <p className="muted" style={{fontSize:10,marginTop:6}}>Heuristic model using budget, genre, popularity, and release signals. Not a financial forecast.</p>
      </div>
      <span className="outline-pill">HEURISTIC-V1</span>
    </div>
    <PredictionCard title={title}/>
  </div>

  {/* ── Community Pulse ────────────────────────────────────────────────────── */}
  <div className="forecast-divider">
    <span><Activity size={13}/> COMMUNITY VOTE</span>
  </div>

  <div className="forecast-top-grid">
   <section className="poll-card glass">
    <div className="card-eyebrow"><Activity size={16}/> COMMUNITY OUTLOOK <span className="outline-pill">{pulse.stage==='no-data'?'NO VOTES':pulse.stage==='early'?'EARLY SAMPLE':pulse.stage==='growing'?'GROWING SAMPLE':'50+ VOTERS'}</span></div>
    <div className="poll-number">{share===null?'—':<>{share}<span>%</span></>}<div>{share===null?'Your call can start the conversation.':isTv?'expect an audience hit':'are calling it a hit'}<small>{pulse.count} account{pulse.count===1?'':'s'} · one current vote each</small></div></div>
    <div className="poll-track"><div style={{width:`${share??0}%`}}/></div>
    <div className="poll-labels"><span><i/> {pulse.hit} hit</span><span>{pulse.flop} flop <i/></span></div>
    {pulse.interval&&<div className="poll-interval">95% Wilson interval: <b>{Math.round(pulse.interval[0]*100)}–{Math.round(pulse.interval[1]*100)}%</b><small>For the poll share, not the chance of commercial success. Self-selected users are not a representative audience sample.</small></div>}
    {pulse.count<10&&<p className="sample-warning">{pulse.count===0?'No community evidence yet. No score is invented to fill the space.':'Very small sample. Treat this as conversation, not a consensus.'}</p>}
   </section>

   <form className="your-call glass" onSubmit={submit} aria-busy={busy} aria-describedby={error?'forecast-form-error':undefined}>
    <div className="card-eyebrow"><BarChart3 size={16}/> YOUR OPENING CALL</div>
    <h3>{pulse.forecastOpen?'Trust your taste.\nMake the call.':'The opening bell has rung.'}</h3>
    {pulse.forecastOpen?<>
     <div className="choice-group">
      <button type="button" disabled={busy} className={choice==='hit'?'chosen hit':''} onClick={()=>setChoice('hit')} aria-pressed={choice==='hit'}><TrendingUp size={18}/> Hit</button>
      <button type="button" disabled={busy} className={choice==='flop'?'chosen flop':''} onClick={()=>setChoice('flop')} aria-pressed={choice==='flop'}><TrendingDown size={18}/> Flop</button>
     </div>
     <label className="range-label">Your confidence <b>{confidence}%</b>
      <input aria-label="Your forecast confidence" disabled={busy} type="range" min={50} max={100} step={5} value={confidence} onChange={e=>setConfidence(Number(e.target.value))}/>
     </label>
     <small className="muted">A personal belief, not measured model confidence.</small>
     <textarea aria-label="Reason for your prediction" aria-describedby={error?'forecast-form-error':undefined} disabled={busy} placeholder="What makes you think so? (optional)" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} rows={2}/>
     <button className="button primary full" disabled={busy}>{busy?'Saving…':!user?'Sign in to make your call':pulse.myForecast?'Update my forecast':'Save my forecast'}<ArrowRight size={16}/></button>
    </>:<p className="muted"><LockKeyhole size={16}/> Forecasts close on the listed release date (00:00 UTC), or stay closed when the date is unknown.</p>}
    {pulse.myForecast&&<p className="recorded"><Check size={13}/> You called {pulse.myForecast.choice} at {pulse.myForecast.confidence}% confidence · {new Date(pulse.myForecast.updatedAt).toLocaleDateString('en-IN')}</p>}
   </form>
  </div>

  {error&&<div id="forecast-form-error"><ErrorBox message={error}/></div>}

  <section className="evidence-section"><div className="section-heading compact"><div><span className="eyebrow">KNOW WHAT YOU KNOW</span><h3>The evidence desk.</h3></div><span className="outline-pill">NO HIDDEN WEIGHTS</span></div>
  <div className="evidence-grid">
   <Evidence label="Catalog & release" value={title.source==='tmdb'?'TMDB metadata':'Fictional demo'} note={dateLabel(title.releaseDate)} ready={title.source==='tmdb'}/>
   <Evidence label="AI model signals" value={title.budget?`$${(title.budget/1e6).toFixed(0)}M budget · ${title.genres[0]??'—'}`:'Limited metadata'} note="Heuristic v1 — genre, budget, season" ready={title.budget!==null||title.voteAverage!==null}/>
   <Evidence label="Community votes" value={`${pulse.count} participants`} note="Collected on this installation" ready={pulse.count>0}/>
   <Evidence label="Trailer & social signals" value="Not connected" note="No scraping or derived hype score" ready={false}/>
  </div></section>

  <section className="history-card glass"><div className="section-heading compact"><div><h3>How the conversation grows</h3><p className="muted">New first-time forecasters per UTC day. Editing a call does not add a person.</p></div><Clock3 size={20}/></div>
  {pulse.history.length?<><div className="history-chart" role="img" aria-label="Daily first-time forecast participants">{pulse.history.slice(-14).map(h=><div className="history-bar" key={h.date}><span>{h.count}</span><div style={{height:`${Math.max(4,h.count/maxHistory*95)}px`}} title={`${h.date}: ${h.count} first participants`}/><small>{h.date.slice(5)}</small></div>)}</div>
  <details className="history-table-wrap"><summary>View this history as a table</summary><table className="history-table"><caption>First-time forecast participants by UTC day</caption><thead><tr><th scope="col">UTC date</th><th scope="col">New participants</th><th scope="col">Hit votes</th></tr></thead><tbody>{pulse.history.slice(-14).map(h=><tr key={h.date}><th scope="row">{h.date}</th><td>{h.count}</td><td>{h.hit}</td></tr>)}</tbody></table></details></>:<div className="quiet-state">No history yet. The first real forecast starts the timeline.</div>}</section>

  {!isTv&&<ScenarioCalculator title={title}/>}

  <details className="method-details"><summary>How to interpret this forecast</summary><p>{pulse.target}</p><p>The displayed percentage is hit votes divided by all current votes. The interval uses the Wilson method with z = 1.96. Participation is voluntary; no interval corrects for audience selection bias or multiple-account abuse. Confidence is a user annotation, never a weighting multiplier. No box-office outcomes have been adjudicated and no accuracy leaderboard is available.</p><p>Catalog dates may be worldwide dates rather than your local release. A title's stored date and cutoff at each submission are retained with its event. This is a local MVP, not a tamper-proof prediction market.</p></details>
 </div>;
}

function Evidence({label,value,note,ready}:{label:string;value:string;note:string;ready:boolean}){return <div className="evidence-item"><div>{ready?<CheckCircle2 size={16} className="mint"/>:<Minus size={16}/>}<span>{label}</span></div><strong>{value}</strong><small>{note}</small></div>}

function ScenarioCalculator({title}:{title:Title}){
 const [budget,setBudget]=useState(title.budget?String(Math.round(title.budget/1e6)):'');const [marketing,setMarketing]=useState('');const [share,setShare]=useState('50');const b=Number(budget),m=Number(marketing),s=Number(share);const valid=budget!==''&&marketing!==''&&share!==''&&b>0&&m>=0&&s>0&&s<=100;const target=valid?(b+m)/(s/100):null;
 return <details className="scenario"><summary><span><BarChart3 size={18}/> Box-office scenario lab <small>ASSUMPTIONS, NOT A PREDICTION</small></span></summary><p>Explore a simplified theatrical recovery target. Enter your own assumptions in USD millions. Reported production budget: <b>{money(title.budget)}</b>.</p><div className="scenario-inputs"><label>Production ($m)<input type="number" min="0.01" step="any" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="e.g. 100"/></label><label>Marketing ($m)<input type="number" min="0" step="any" value={marketing} onChange={e=>setMarketing(e.target.value)} placeholder="e.g. 50"/></label><label>Studio share (%)<input type="number" min="1" max="100" step="any" value={share} onChange={e=>setShare(e.target.value)}/></label></div><div className="scenario-result"><span>Implied worldwide gross target</span><strong>{target===null?'Enter your assumptions':money(target*1e6)}</strong></div><p className="fineprint">(Production + marketing) ÷ assumed studio share. Excludes financing, distribution costs, taxes, participations, country-specific splits, and non-theatrical revenue. This is not actual break-even, a profit estimate, or investment advice. Inputs are not saved or added to community predictions.</p></details>;
}

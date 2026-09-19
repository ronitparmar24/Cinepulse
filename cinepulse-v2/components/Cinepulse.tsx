'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Activity,ArrowUpRight,Bookmark,CalendarDays,Check,Compass,Search,Users,X,ShieldCheck,Rss,Trophy} from 'lucide-react';
import type {Config,LibraryEntry,Title,User} from '@/lib/types';
import {parseNavigation,navigationUrl,type DetailTab,type View} from '@/lib/navigation';
import {api} from './client';
import {AppContext} from './Context';
import {Logo,Methodology,Modal} from './UI';
import {Discovery} from './Discovery';
import {TitleDetail} from './TitleDetail';
import {AuthDialog,ProfileDialog} from './Account';
import {WelcomePopup} from './WelcomePopup';
import {Community,Library,PredictionHub} from './Spaces';
import {ActivityFeed} from './ActivityFeed';
import {NotificationsBell} from './NotificationsPopover';
import {AccuracyView} from './AccuracyView';
import {LeaderboardView} from './LeaderboardView';
const links=[{id:'discover',label:'Discover',Icon:Compass},{id:'predictions',label:'Predictions',Icon:Activity},{id:'leaderboard',label:'Leaderboard',Icon:Trophy},{id:'accuracy',label:'Accuracy',Icon:ShieldCheck},{id:'calendar',label:'Calendar',Icon:CalendarDays},{id:'community',label:'Community',Icon:Users},{id:'feed',label:'Activity Feed',Icon:Rss},{id:'library',label:'My library',Icon:Bookmark}] as const;
type Selected={id:string;tab:DetailTab};
export default function Cinepulse(){
 const [view,setView]=useState<View>('discover'),[config,setConfig]=useState<Config|null>(null),[user,setUser]=useState<User|null>(null),[library,setLibrary]=useState<LibraryEntry[]>([]),[auth,setAuth]=useState(false),[profile,setProfile]=useState(false),[about,setAbout]=useState(false),[selected,setSelected]=useState<Selected|null>(null),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[busyIds,setBusyIds]=useState<Set<string>>(new Set()),[pendingRemoval,setPendingRemoval]=useState<{title:Title;entry:LibraryEntry}|null>(null),[healthBusy,setHealthBusy]=useState(false),[shortcut,setShortcut]=useState('Ctrl K'),[welcomeUser,setWelcomeUser]=useState<User|null>(null);
 const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);const searchRef=useRef<HTMLInputElement>(null);const busyRef=useRef(new Set<string>());
 const toast=useCallback((text:string)=>{setMessage(text);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setMessage(''),4500);},[]);
 const syncUrl=useCallback(()=>{const state=parseNavigation(window.location.search);setView(state.view);setSelected(state.titleId?{id:state.titleId,tab:state.tab}:null);},[]);
 const refresh=useCallback(async()=>{const {user:u}=await api<{user:User|null}>('/auth/me');setUser(u);setLibrary(u?(await api<{items:LibraryEntry[]}>('/library')).items:[]);},[]);
 useEffect(()=>{syncUrl();const onPop=()=>syncUrl();window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[syncUrl]);
 useEffect(()=>{
   if(typeof window==='undefined')return;
   const hash=window.location.hash;
   if(hash.includes('access_token=')){
     const params=new URLSearchParams(hash.replace(/^#/,''));
     const accessToken=params.get('access_token');
     const refreshToken=params.get('refresh_token');
     if(accessToken){
       window.history.replaceState(null,'',window.location.pathname+window.location.search);
       api<{user:User}>('/auth/session','POST',{access_token:accessToken,refresh_token:refreshToken})
         .then(async(res)=>{
           await refresh();
           setWelcomeUser(res.user);
           toast(`Welcome, ${res.user.name||'film lover'}!`);
         })
         .catch(err=>{
           toast((err as Error).message||'Failed to complete Google sign-in.');
         });
     }
   }else if(hash.includes('error=')){
     const params=new URLSearchParams(hash.replace(/^#/,''));
     const errorDesc=params.get('error_description')||params.get('error')||'Authentication failed';
     window.history.replaceState(null,'',window.location.pathname+window.location.search);
     toast(decodeURIComponent(errorDesc).replace(/\+/g,' '));
   }
   const searchParams=new URLSearchParams(window.location.search);
   if(searchParams.has('auth_success')){
     searchParams.delete('auth_success');
     const newSearch=searchParams.toString()?`?${searchParams.toString()}`:'';
     window.history.replaceState(null,'',window.location.pathname+newSearch);
     refresh().then(async()=>{
       const {user:u}=await api<{user:User|null}>('/auth/me');
       if(u) setWelcomeUser(u);
       toast('Signed in successfully with Google!');
     }).catch(()=>{});
   }else if(searchParams.has('auth_error')){
     const err=searchParams.get('auth_error')||'Google sign-in failed';
     searchParams.delete('auth_error');
     const newSearch=searchParams.toString()?`?${searchParams.toString()}`:'';
     window.history.replaceState(null,'',window.location.pathname+newSearch);
     toast(decodeURIComponent(err).replace(/\+/g,' '));
   }
 },[refresh,toast]);
 useEffect(()=>{let active=true;api<Config>('/config').then(base=>{if(!active)return;setConfig(base);return api<Config>('/config/health');}).then(health=>{if(active&&health)setConfig(previous=>previous?{...previous,health:health.health}:health);}).catch(e=>{if(active)toast(e.message||'Catalog status is unavailable.');});refresh().catch(e=>{if(active)toast(e.message);});return()=>{active=false;if(toastTimer.current)clearTimeout(toastTimer.current);};},[refresh,toast]);
 useEffect(()=>{setShortcut(/Mac|iPhone|iPad|iPod/.test(navigator.platform)?'⌘ K':'Ctrl K');const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const updateUrl=useCallback((state:{view:View;titleId:string|null;tab:DetailTab},mode:'push'|'replace'='replace',historyState?:Record<string,unknown>)=>{const url=navigationUrl(window.location,state);if(mode==='push')window.history.pushState(historyState||null,'',url);else window.history.replaceState({...window.history.state,...historyState},'',url);},[]);
 function navigate(next:View){setView(next);setSelected(null);setSearch('');updateUrl({view:next,titleId:null,tab:'overview'},'push',{cinepulseNavigation:true});window.scrollTo({top:0,behavior:'smooth'});}
 function openTitle(id:string,tab:DetailTab='overview'){const next={view,titleId:id,tab};setSelected({id,tab});if(selected){const openedByApp=window.history.state?.cinepulseTitle===true;updateUrl(next,'replace',{cinepulseTitle:openedByApp});}else updateUrl(next,'push',{cinepulseTitle:true});}
 function changeTitleTab(tab:DetailTab){if(!selected)return;setSelected({...selected,tab});const openedByApp=window.history.state?.cinepulseTitle===true;updateUrl({view,titleId:selected.id,tab},'replace',{cinepulseTitle:openedByApp});}
 function closeTitle(){if(window.history.state?.cinepulseTitle){window.history.back();return;}setSelected(null);updateUrl({view,titleId:null,tab:'overview'},'replace');}
 function needAuth(){if(user)return true;setAuth(true);return false;}
 async function libraryMutation(title:Title,operation:()=>Promise<unknown>,success:string){if(!needAuth()||busyRef.current.has(title.id))return;busyRef.current.add(title.id);setBusyIds(new Set(busyRef.current));try{await operation();await refresh();toast(success);}catch(e){toast((e as Error).message);}finally{busyRef.current.delete(title.id);setBusyIds(new Set(busyRef.current));}}
 async function remove(title:Title){const entry=library.find(x=>x.title.id===title.id);if(!entry)return;if(entry.status!=='watchlist'||entry.rating!==null){setPendingRemoval({title,entry});return;}await libraryMutation(title,()=>api(`/library/${title.id}`,'DELETE'),'Removed from your library.');}
 async function save(title:Title){const exists=library.some(x=>x.title.id===title.id);if(exists){await remove(title);return;}await libraryMutation(title,()=>api(`/library/${title.id}`,'PUT',{status:'watchlist'}),'Saved. Your next movie night is taking shape.');}
 async function updateLibrary(title:Title,status:LibraryEntry['status'],rating?:number|null){await libraryMutation(title,()=>api(`/library/${title.id}`,'PUT',{status,...(rating!==undefined?{rating}:{})}),'Your library is up to date.');}
 async function confirmRemoval(){if(!pendingRemoval)return;const {title}=pendingRemoval;setPendingRemoval(null);await libraryMutation(title,()=>api(`/library/${title.id}`,'DELETE'),'Removed from your library.');}
 const health=config?.health;const healthLabel=!config?'Checking catalog…':config.mode==='demo'?'Demo catalog · Fictional titles':health?.status==='verified'?'TMDB catalog · Verified reachable':health?.status==='checking'?'TMDB catalog · Checking…':health?.status==='configured'?'TMDB catalog · Not checked':'TMDB catalog · Unavailable';
 async function retryHealth(){if(healthBusy||config?.mode!=='tmdb')return;setHealthBusy(true);setConfig(previous=>previous?{...previous,health:{...previous.health,status:'checking',message:'Checking the catalog provider…'}}:previous);try{const next=await api<Config>('/config/health/retry','POST');setConfig(previous=>previous?{...previous,health:next.health}:next);}catch(e){setConfig(previous=>previous?{...previous,health:{status:'unavailable',checkedAt:new Date().toISOString(),message:'The connection check failed. Retry when the local server is reachable.'}}:previous);toast((e as Error).message);}finally{setHealthBusy(false);}}
 return <AppContext.Provider value={{user,config,library,openTitle,save,remove,updateLibrary,refresh,toast,needAuth,showAuth:()=>setAuth(true),busyIds}}>
 <a className="skip-link" href="#main">Skip to content</a><div className="ambient" aria-hidden="true"/>
 <header className="header"><button className="brand-button" onClick={()=>navigate('discover')} aria-label="Cinepulse home"><Logo/></button>
 <nav className="desktop-nav glass" aria-label="Main navigation">{links.map(({id,label})=><button key={id} onClick={()=>navigate(id)} className={view===id?'active':''} aria-current={view===id?'page':undefined}>{label}{id==='predictions'&&<i className="mini-dot"/>}</button>)}</nav>
 <div className="header-right"><label className="header-search"><Search size={16}/><input ref={searchRef} placeholder="Find your next…" value={search} onChange={e=>{setSearch(e.target.value);if(view!=='discover'){setView('discover');updateUrl({view:'discover',titleId:null,tab:'overview'},'push',{cinepulseNavigation:true});}}} aria-label="Search movies and series"/>{search?<button onClick={()=>setSearch('')} aria-label="Clear search"><X size={14}/></button>:<kbd>{shortcut}</kbd>}</label><NotificationsBell currentUser={user}/><button className="avatar" onClick={()=>user?setProfile(true):setAuth(true)} aria-label={user?'Open your profile':'Sign in'}>{user?user.name.slice(0,1).toUpperCase():<Users size={17}/>}<i/></button></div>
 </header>
 <div className="mode-line"><span title={health?.message||undefined} aria-live="polite"><span className={`status-dot ${health?.status==='verified'?'live':''}`} aria-hidden="true"/>{healthLabel}</span>{config?.mode==='tmdb'&&health?.status!=='verified'&&<button className="health-retry" onClick={retryHealth} disabled={healthBusy}>{healthBusy?'Checking…':'Retry connection'}</button>}<button onClick={()=>setAbout(true)}>Real accounts. Transparent predictions. <ArrowUpRight size={12}/></button></div>
 <main id="main" tabIndex={-1}>{view==='discover'||view==='calendar'?<Discovery search={search} calendar={view==='calendar'}/>:view==='predictions'?<PredictionHub/>:view==='leaderboard'?<LeaderboardView/>:view==='accuracy'?<AccuracyView/>:view==='community'?<Community/>:view==='feed'?<ActivityFeed/>:<Library/>}</main>
 <section className="bottom-banner"><div className="banner-icon"><Activity size={27}/></div><div><span className="eyebrow">A LITTLE CURIOSITY. A BETTER MOVIE NIGHT.</span><h3>Discover it. Save it. Call it before the credits.</h3></div><button className="button secondary" onClick={()=>user?navigate('predictions'):setAuth(true)}>{user?'Explore predictions':'Make it yours'} <ArrowUpRight size={16}/></button></section>
 <footer><Logo/><span>For the love of what’s next.</span><div><button onClick={()=>setAbout(true)}>How it works</button><span>Local-first · No streaming</span></div>{config?.mode==='tmdb'&&<p className="attribution"><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img src="https://files.readme.io/29c6fee-blue_short.svg" alt="The Movie Database"/></a>This product uses the TMDB API but is not endorsed or certified by TMDB. Artwork belongs to its respective owners.</p>}</footer>
 <nav className="mobile-nav glass" aria-label="Mobile navigation">{links.map(({id,label,Icon})=><button key={id} onClick={()=>navigate(id)} className={view===id?'active':''} aria-current={view===id?'page':undefined}><Icon size={20}/><span>{label==='My library'?'Library':label}</span></button>)}</nav>
 {selected&&<TitleDetail key={selected.id} id={selected.id} initialTab={selected.tab} onTabChange={changeTitleTab} onClose={closeTitle}/>} {profile&&user&&<ProfileDialog onClose={()=>setProfile(false)}/>} {auth&&<AuthDialog onClose={()=>setAuth(false)} onSuccess={u=>setWelcomeUser(u)}/>} {welcomeUser&&<WelcomePopup user={welcomeUser} onClose={()=>setWelcomeUser(null)} onNavigate={v=>navigate(v)}/>} {about&&<Modal label="How Cinepulse works" wide onClose={()=>setAbout(false)}><Methodology/><div className="about-bottom"><ShieldCheck size={20}/><p>This is a local development app. Your account data lives in this installation’s SQLite database. Export or delete it from your profile. In demo mode only the catalog and artwork are fictional; there are no seeded people, ratings, or forecast votes.</p></div></Modal>}
 {pendingRemoval&&<Modal label="Confirm removal" onClose={()=>setPendingRemoval(null)}><div className="confirm-dialog"><span className="signal-icon"><Bookmark size={20}/></span><h2>Remove {pendingRemoval.title.title}?</h2><p>This will remove your {pendingRemoval.entry.status==='watched'?'watched record':pendingRemoval.entry.status==='watching'?'watching status':'saved title'}{pendingRemoval.entry.rating!==null?' and private rating':''} from this library. Your public review and forecast, if any, stay separate.</p><div className="confirm-actions"><button className="button secondary" onClick={()=>setPendingRemoval(null)}>Keep it</button><button className="button danger" onClick={()=>void confirmRemoval()}>Remove from library</button></div></div></Modal>}
 {message&&<div className="toast" role="status"> <Check size={17}/>{message}</div>}
 </AppContext.Provider>;
}

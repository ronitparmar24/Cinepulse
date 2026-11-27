'use client';
import {useEffect,useRef,useState} from 'react';
import {Share2} from 'lucide-react';
import {ShareSheet} from './ShareSheet';
import {ReportButton} from './ReportButton';
import {StarRating} from './StarRating';
import {ratingLabel,starText} from '@/lib/rating';
import {ArrowUpRight,Eye,EyeOff,MessageCircle,Trash2} from 'lucide-react';
import type {Review,Title} from '@/lib/types';
import {api} from './client';
import {useApp} from './Context';
import {Empty,ErrorBox,Loading} from './UI';
import {AiBadge} from './AiBadge';
import {ReviewSocial,timeAgo} from './ReviewThread';
import {RingAvatar} from './SocialMotion';
import './review-card.css';

export function ReviewCard({review,onDelete,showTitle=true,autoShare=false,onShareClosed}:{review:Review;onDelete?:()=>void;showTitle?:boolean;autoShare?:boolean;onShareClosed?:()=>void}){
 const {user,openTitle,toast}=useApp();const [show,setShow]=useState(!review.spoiler),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[sharing,setSharing]=useState(autoShare);
 // Set only when the reader reveals a spoiler, so the un-blur plays on reveal and not on first paint.
 const [revealed,setRevealed]=useState(false);
 useEffect(()=>{if(autoShare)setSharing(true);},[autoShare]);
 useEffect(()=>{setShow(!review.spoiler);setRevealed(false);},[review.spoiler,review.body]);
 async function remove(){setBusy(true);try{await api(`/reviews/${review.titleId}`,'DELETE');onDelete?.();toast('Your review was deleted.');}catch(e){toast((e as Error).message);}finally{setBusy(false);}}
 const rating=review.rating!==null?Math.min(review.rating,5):null;
 const when=new Date(review.createdAt);
 const avatar=<RingAvatar name={review.name} size={38}/>;
 return <article className={`review-card glass rc ${review.spoiler?'rc-has-spoiler':''}`}>
  <div className="review-head rc-head">
   {review.username?<a href={`/u/${review.username}`} className="rc-avatar-link" aria-label={`${review.name}’s profile`}>{avatar}</a>:avatar}
   <div className="rc-who">
    <b>{review.username?<a href={`/u/${review.username}`} className="rc-name">{review.name}</a>:review.name}{review.isAi && <AiBadge />}</b>
    <small>{review.kind==='first-impression'?'First impression':'Review'} · <time dateTime={review.createdAt} title={when.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}>{timeAgo(review.createdAt)}</time></small>
   </div>
   {rating!==null&&rating>0&&<span className="review-stars rc-stars" aria-label={`Rated ${ratingLabel(rating)} out of 5`}><span className="rc-stars-on" aria-hidden="true">{starText(rating)}</span><span className="rc-stars-off" aria-hidden="true">{'★'.repeat(Math.max(0,5-Math.ceil(rating)))}</span></span>}
  </div>
  {showTitle&&<button className="review-title" onClick={()=>openTitle(review.titleId)}>{review.titleName}<ArrowUpRight size={14}/></button>}
  {show
   ?<p className={`review-body rc-body ${revealed?'is-revealed':''}`}>{review.body}</p>
   :<div className="rc-veil">
     <p className="rc-body rc-veiled" aria-hidden="true">{review.body}</p>
     <button className="rc-reveal" onClick={()=>{setRevealed(true);setShow(true);}}><EyeOff size={16}/> Contains spoilers. Reveal this take.</button>
    </div>}
  {review.spoiler&&show&&<button className="text-link muted rc-hide" onClick={()=>{setRevealed(false);setShow(false);}}><Eye size={13}/> Hide spoiler</button>}
  {user?.id===review.userId&&<div className="review-delete">{confirm?<><span>Delete your take?</span><button disabled={busy} onClick={remove}>{busy?'Deleting…':'Delete'}</button><button disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button></>:<button aria-label="Delete your review" onClick={()=>setConfirm(true)}><Trash2 size={14}/> Delete my take</button>}</div>}
  <ReviewSocial reviewId={review.id} authorName={review.name} likesCount={review.likesCount} commentsCount={review.commentsCount} viewerLiked={review.viewerLiked}><button type="button" className="review-share-btn" onClick={()=>setSharing(true)} aria-label={`Share ${user?.id===review.userId?'your':`${review.name}’s`} review of ${review.titleName}`}><Share2 size={13}/> Share</button>{user?.id!==review.userId&&<ReportButton targetType="review" targetId={review.id} authorId={review.userId}/>}</ReviewSocial>
  {sharing&&<ShareSheet kind="review" id={review.id} title={review.titleName} version={review.createdAt} onClose={()=>{setSharing(false);onShareClosed?.();}}/>}
 </article>;
}
function normalizeReview(value:string){return value.trim().replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');}
export function TitleReviews({title}:{title:Title}){
 const {user,needAuth,toast}=useApp();const [reviews,setReviews]=useState<Review[]|null>(null),[body,setBody]=useState(''),[rating,setRating]=useState(0),[spoiler,setSpoiler]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0),[editing,setEditing]=useState(true),[dirty,setDirty]=useState(false),[shareNew,setShareNew]=useState(false);const initialized=useRef(false);const dirtyRef=useRef(false);
 useEffect(()=>{initialized.current=false;dirtyRef.current=false;setBody('');setRating(0);setSpoiler(false);dirtyRef.current=false;setDirty(false);setEditing(true);setReviews(null);setError('');},[title.id,user?.id]);
 useEffect(()=>{let active=true;api<{reviews:Review[]}>(`/reviews/${title.id}`).then(data=>{if(!active)return;setReviews(data.reviews);const mine=data.reviews.find(r=>r.userId===user?.id)||null;if(!dirtyRef.current){setBody(mine?.body||'');setRating(mine?.rating||0);setSpoiler(mine?.spoiler||false);}if(!initialized.current)setEditing(!mine);else if(!mine)setEditing(true);initialized.current=true;}).catch(e=>active&&setError(e.message||'Reviews could not be loaded.'));return()=>{active=false;};},[title.id,user?.id,version]);
 function changeBody(value:string){dirtyRef.current=true;setDirty(true);setBody(value);}function changeRating(value:number){dirtyRef.current=true;setDirty(true);setRating(value);}function changeSpoiler(value:boolean){dirtyRef.current=true;setDirty(true);setSpoiler(value);}
 async function submit(e:React.FormEvent){e.preventDefault();if(!needAuth())return;const normalized=normalizeReview(body);if(!normalized){setError('Write at least one non-space character before saving.');return;}setBusy(true);setError('');try{await api(`/reviews/${title.id}`,'POST',{body:normalized,rating:title.status==='released'&&rating?rating:null,spoiler});setBody(normalized);dirtyRef.current=false;setDirty(false);setEditing(false);setVersion(n=>n+1);setShareNew(true);toast('Your take is now part of the conversation.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(reviews===null)return error?<ErrorBox message={error} retry={()=>setVersion(n=>n+1)}/>:<Loading/>;
 const mine=reviews.find(r=>r.userId===user?.id)||null;
 return <section className="title-reviews"><div className="section-heading compact"><div><span className="eyebrow">THE CONVERSATION</span><h3>{title.status==='released'?'After the credits.':'Before the first frame.'}</h3></div><MessageCircle size={22}/></div>{mine&&!editing?<div className="existing-review"><ReviewCard review={mine} showTitle={false} onDelete={()=>setVersion(n=>n+1)} autoShare={shareNew} onShareClosed={()=>setShareNew(false)}/><button className="button secondary" onClick={()=>{setBody(mine.body);setRating(mine.rating||0);setSpoiler(mine.spoiler);dirtyRef.current=false;setDirty(false);setEditing(true);setError('');}}>Edit my take</button></div>:<form className="review-form glass" onSubmit={submit} aria-busy={busy} aria-describedby={error?'review-form-error':undefined}><label htmlFor="review-body">{title.status==='released'?'Your review':'Your first impression'}<small>{title.status==='released'?'Seen it? Share a thoughtful take.':'Discuss your expectations. Star ratings open after release.'}</small></label><textarea id="review-body" value={body} onChange={e=>changeBody(e.target.value)} disabled={busy} required maxLength={5000} rows={3} placeholder="What is your take?"/>{title.status==='released'&&<div className="star-picker"><StarRating value={rating} onChange={changeRating} disabled={busy} label="Review rating" size={24}/><span>{rating?ratingLabel(rating):'Optional rating'}</span></div>}<div className="review-form-footer"><label className="checkbox"><input type="checkbox" checked={spoiler} disabled={busy} onChange={e=>changeSpoiler(e.target.checked)}/> Contains spoilers</label><button className="button primary" disabled={busy}>{busy?'Saving…':!user?'Sign in to share':mine?'Update my take':'Share my take'}</button>{mine&&<button type="button" className="button secondary" disabled={busy||!dirty} onClick={()=>{setBody(mine.body);setRating(mine.rating||0);setSpoiler(mine.spoiler);dirtyRef.current=false;setDirty(false);setEditing(false);setError('');}}>Discard edits</button>}</div><p className="fineprint">Your display name and take are visible to people using this installation. Your email is never public.</p>{error&&<div id="review-form-error"><ErrorBox message={error}/></div>}</form>}<div className="title-review-list">{reviews.length?reviews.filter(r=>r.id!==mine?.id).map(r=><ReviewCard key={r.id+String(version)} review={r} showTitle={false} onDelete={()=>setVersion(n=>n+1)}/>):<Empty title="The first word is yours." icon={MessageCircle}>No seeded reviews or imaginary critics. Start a real conversation.</Empty>}</div></section>;
}

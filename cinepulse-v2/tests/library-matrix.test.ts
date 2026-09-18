import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const folder=mkdtempSync(join(tmpdir(),'cinepulse-matrix-'));
process.env.DATABASE_PATH=join(folder,'test.db');process.env.CATALOG_MODE='tmdb';process.env.TMDB_READ_TOKEN='matrix-mock-only';
const original=globalThis.fetch;
const {db}=await import('../lib/db');const {putLibrary}=await import('../lib/library');const {putReview,titleReviews}=await import('../lib/reviews');const {isForecastOpen}=await import('../lib/pulse');
const user={id:'matrix-user',name:'Matrix',email:'matrix@example.test',createdAt:new Date().toISOString()};
db().prepare('INSERT INTO users (id,name,email,password_hash,created_at,username) VALUES(?,?,?,?,?,?)').run(user.id,user.name,user.email,'not-a-password',user.createdAt,'matrix');
test.after(()=>{globalThis.fetch=original;db().close();rmSync(folder,{recursive:true,force:true});});
test('movie and TV release matrix validates direct writes and review classification for released, future, and unknown dates',async()=>{
 let n=1000;
 for(const mediaType of ['movie','tv'])for(const date of ['2000-01-01','2099-01-01',null]){
  const id=++n,titleId=`${mediaType}-${id}`;
  globalThis.fetch=(async()=>new Response(JSON.stringify({id,title:'Matrix Film',name:'Matrix TV',release_date:date,first_air_date:date,genres:[],credits:{cast:[],crew:[]},videos:{results:[]}}),{status:200})) as typeof fetch;
  await putLibrary(user,titleId,{status:'watchlist'});
  for(const input of [{status:'watching'},{status:'watched',rating:5},{status:'watchlist',rating:1}]){
   if(date==='2000-01-01')await putLibrary(user,titleId,input);else await assert.rejects(()=>putLibrary(user,titleId,input),(error:any)=>error.status===400);
  }
  await putReview(user,titleId,{body:'  Thoughtful    take.  ',spoiler:false});
  const revs = await titleReviews(titleId);
  assert.equal(revs[0].kind,date==='2000-01-01'?'review':'first-impression');assert.equal(revs[0].body,'Thoughtful take.');
  if(date!=='2000-01-01')await assert.rejects(()=>putReview(user,titleId,{body:'Not yet',spoiler:false,rating:5}),(error:any)=>error.status===400);
 }
});
test('impossible dates never accept forecasts',()=>{assert.equal(isForecastOpen('2099-02-30','2026-09-17'),false);assert.equal(isForecastOpen('2099-02-28','2026-09-17'),true);});

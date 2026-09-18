import test from 'node:test';
import assert from 'node:assert/strict';

const base=process.env.TEST_BASE_URL?.replace(/\/$/,'');
const run=base ? test : test.skip;
const password='integration password long enough';
async function call(path:string, init:RequestInit={}) {
  return fetch(`${base}${path}`,{...init,headers:{Accept:'application/json',...(init.headers||{})}});
}
function jsonInit(method:string, origin:string, cookie:string|undefined, value:unknown):RequestInit {
  return {method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}: {})},body:JSON.stringify(value)};
}
async function payload(response:Response):Promise<any> { return response.json(); }

run('two-account isolation, pulse history, review ownership, export, and cascade', async () => {
  const origin=base!; const suffix=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const emailA=`cinepulse-a-${suffix}@example.test`, emailB=`cinepulse-b-${suffix}@example.test`;
  const signupA=await call('/api/auth/register',jsonInit('POST',origin,undefined,{name:'Account A',email:emailA,password})); assert.equal(signupA.status,200);
  const signupB=await call('/api/auth/register',jsonInit('POST',origin,undefined,{name:'Account B',email:emailB,password})); assert.equal(signupB.status,200);
  const cookieA=signupA.headers.get('set-cookie')!.split(';')[0], cookieB=signupB.headers.get('set-cookie')!.split(';')[0];

  assert.equal((await call('/api/library',{headers:{Cookie:cookieA}})).status,200);
  const add=await call('/api/library/demo-neon',jsonInit('PUT',origin,cookieA,{status:'watchlist'})); assert.equal(add.status,200);
  const bLibrary=await call('/api/library',{headers:{Cookie:cookieB}}); assert.deepEqual((await payload(bLibrary)).items,[]);
  assert.equal((await call('/api/library/demo-neon',jsonInit('DELETE',origin,cookieB,{}))).status,404);

  const body='<img src=x onerror="alert(1)"> exact payload';
  const review=await call('/api/reviews/demo-neon',jsonInit('POST',origin,cookieA,{body,spoiler:false})); assert.equal(review.status,200);
  const reviews=await call('/api/reviews/demo-neon'); assert.equal(reviews.status,200); const reviewData=await payload(reviews);
  assert.equal(reviewData.reviews.length,1); assert.equal(reviewData.reviews[0].body,body);
  assert.equal((await call('/api/reviews/demo-neon',jsonInit('DELETE',origin,cookieB,{}))).status,404);

  const pulseA=await call('/api/pulse/demo-neon',jsonInit('POST',origin,cookieA,{choice:'hit',confidence:70,reason:'first'})); assert.equal(pulseA.status,200);
  const pulseEdit=await call('/api/pulse/demo-neon',jsonInit('POST',origin,cookieA,{choice:'flop',confidence:55,reason:'changed'})); assert.equal(pulseEdit.status,200);
  const pulseB=await call('/api/pulse/demo-neon',jsonInit('POST',origin,cookieB,{choice:'hit',confidence:90,reason:'optimistic'})); assert.equal(pulseB.status,200);
  const aggregate=await call('/api/pulse/demo-neon'); const pulse= (await payload(aggregate)).pulse;
  assert.equal(pulse.count,2); assert.equal(pulse.hit,1); assert.equal(pulse.flop,1); assert.equal(pulse.history.reduce((n:any,x:any)=>n+x.count,0),2); assert.equal(pulse.history.reduce((n:any,x:any)=>n+x.hit,0),2);

  const exported=await call('/api/export',{headers:{Cookie:cookieA}}); assert.equal(exported.status,200); const exportData=await payload(exported);
  const exportText=JSON.stringify(exportData); assert.equal(exportData.library.length,1); assert.equal(exportData.forecasts.length,1); assert.match(exportText,new RegExp(emailA)); assert.equal(exportText.includes('password_hash'),false); assert.equal(exportText.includes('cinepulse_session'),false);
  assert.equal((await call('/api/reviews/demo-neon',jsonInit('DELETE',origin,cookieA,{}))).status,200);

  const badLogin=await call('/api/auth/login',jsonInit('POST',origin,undefined,{email:emailA,password:'wrong password'})); assert.equal(badLogin.status,401);
  const login=await call('/api/auth/login',jsonInit('POST',origin,undefined,{email:emailA,password})); assert.equal(login.status,200); const loginCookie=login.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await call('/api/auth/logout',jsonInit('POST',origin,loginCookie,{}))).status,200);

  const deleted=await call('/api/account',jsonInit('DELETE',origin,cookieA,{password})); assert.equal(deleted.status,200);
  assert.equal((await call('/api/auth/me',{headers:{Cookie:cookieA}})).status,200); assert.equal((await payload(await call('/api/auth/me',{headers:{Cookie:cookieA}}))).user,null);
  const remaining=await call('/api/pulse/demo-neon'); const remainingPulse=(await payload(remaining)).pulse; assert.equal(remainingPulse.count,1); assert.equal(remainingPulse.hit,1); assert.equal(remainingPulse.history.reduce((n:any,x:any)=>n+x.count,0),1);
  const bDelete=await call('/api/account',jsonInit('DELETE',origin,cookieB,{password})); assert.equal(bDelete.status,200);
});

run('anonymous denial, CSRF, malformed JSON, and catalog privacy', async () => {
  assert.equal((await call('/api/library')).status,401);
  assert.equal((await call('/api/my-forecasts')).status,401);
  const csrf=await call('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'CSRF',email:`csrf-${Date.now()}@example.test`,password})}); assert.equal(csrf.status,403);
  const primitive=await call('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:base!},body:'[]'}); assert.equal(primitive.status,400);
  const missingType=await call('/api/auth/register',{method:'POST',headers:{Origin:base!},body:JSON.stringify({})}); assert.equal(missingType.status,400);
  const catalog=await call('/api/catalog?media=all&collection=trending'); assert.equal(catalog.status,200);
  const data=await payload(catalog); assert.ok(Array.isArray(data.items)); for (const title of data.items) { assert.equal(title.popularity,null); if (data.mode==='demo') assert.equal(title.voteAverage,null); }
});

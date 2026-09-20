import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CATALOG_MODE='tmdb';
process.env.TMDB_READ_TOKEN='unit-test-token';
process.env.TMDB_REGION=`UT${Date.now()}`;
process.env.DATABASE_PATH=`/tmp/cinepulse-catalog-${process.pid}.db`;

const { catalog, genres, season, titleById } = await import('../lib/catalog');
const originalFetch=globalThis.fetch;
function response(value:unknown,status=200):Response { return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}}); }
function installFetch(handler:(url:URL)=>Response|Promise<Response>):string[] {
  const seen:string[]=[];
  globalThis.fetch=(async (input:RequestInfo|URL) => { const url=new URL(String(input)); seen.push(url.toString()); return handler(url); }) as typeof fetch;
  return seen;
}
function route(url:URL):unknown {
  const p=url.pathname.replace('/3/','');
  if (p==='genre/movie/list') return {genres:[{id:28,name:'Action'},{id:878,name:'Science Fiction'}]};
  if (p==='genre/tv/list') return {genres:[{id:10759,name:'Action & Adventure'},{id:878,name:'Sci-Fi'}]};
  return {};
}

test.afterEach(()=>{ globalThis.fetch=originalFetch; });

test('all search combines movie and TV sources and maps each source genres', async () => {
  const seen=installFetch((url) => {
    const p=url.pathname.replace('/3/','');
    if (p==='search/movie') return response({page:1,total_pages:2,total_results:13,results:[{id:10,title:'Movie result',genre_ids:[28],release_date:'2099-01-01'}]});
    if (p==='search/tv') return response({page:1,total_pages:3,total_results:22,results:[{id:20,name:'TV result',genre_ids:[10759],first_air_date:'2099-02-01'}]});
    return response(route(url));
  });
  const result=await catalog({media:'all',collection:'trending',search:'result',page:1});
  assert.deepEqual(result.items.map(x=>[x.id,x.mediaType,x.genres]),[['movie-10','movie',['Action']],['tv-20','tv',['Action & Adventure']]]);
  assert.equal(result.totalResults,35); assert.equal(result.totalPages,3);
  assert.equal(result.searchSemantics,'all-matching-titles');
  assert.equal(result.ordering,'mixed-source-page-order');
  assert.equal(result.totalResultsComplete,true);
  assert.ok(seen.some(x=>x.includes('/search/movie'))); assert.ok(seen.some(x=>x.includes('/search/tv')));
});

test('trending all excludes people while retaining movie and TV records', async () => {
  const seen=installFetch((url) => {
    const p=url.pathname.replace('/3/','');
    if (p==='trending/all/week') return response({page:1,total_pages:1,total_results:3,results:[
      {id:1,media_type:'person',name:'A person'},
      {id:2,media_type:'movie',title:'A film',genre_ids:[878],release_date:'2099-01-01'},
      {id:3,media_type:'tv',name:'A series',genre_ids:[878],first_air_date:'2099-02-01'}
    ]});
    return response(route(url));
  });
  const result=await catalog({media:'all',collection:'trending',page:1});
  assert.deepEqual(result.items.map(x=>x.mediaType),['movie','tv']);
  assert.equal(result.totalResults,2);
  assert.equal(result.totalResultsScope,'loaded-page-titles');
  assert.equal(result.totalResultsComplete,false);
  assert.ok(seen.some(x=>x.includes('/trending/all/week')));
});

test('TV upcoming uses first-air-date constraints and ascending first-air-date sort', async () => {
  let upcoming:URL|undefined;
  const seen=installFetch((url) => {
    const p=url.pathname.replace('/3/','');
    if (p==='discover/tv') upcoming=url;
    return response(p==='discover/tv'?{page:1,total_pages:1,total_results:0,results:[]}:route(url));
  });
  await catalog({media:'tv',collection:'upcoming',page:1});
  assert.ok(upcoming); assert.equal(upcoming!.searchParams.get('sort_by'),'first_air_date.asc');
  assert.ok(upcoming!.searchParams.has('first_air_date.gte')); assert.equal(upcoming!.searchParams.has('primary_release_date.gte'),false);
  const result=await catalog({media:'tv',collection:'upcoming',page:1});
  assert.equal(result.ordering,'provider-release-date-ascending');
  assert.equal(result.completeness,'provider-paginated');
  assert.ok(seen.some(x=>x.includes('/discover/tv')));
});

test('demo upcoming filters by current status and top keeps source order', async () => {
  process.env.CATALOG_MODE='demo';
  const upcoming=await catalog({media:'all',collection:'upcoming',page:1});
  assert.ok(upcoming.items.length>0); assert.ok(upcoming.items.every(x=>x.status==='upcoming'));
  const top=await catalog({media:'all',collection:'top',page:1});
  assert.deepEqual(top.items.map(x=>x.id),['demo-dunes','demo-neon','demo-orbit','demo-velvet','demo-hollow','demo-redline']);
  process.env.CATALOG_MODE='tmdb';
});

test('genre list and detail/season responses are cached and title mode is guarded', async () => {
  let calls=0;
  installFetch((url) => {
    calls++;
    const p=url.pathname.replace('/3/','');
    if (p==='genre/movie/list') return response({genres:[{id:28,name:'Action'}]});
    if (p==='genre/tv/list') return response({genres:[{id:10759,name:'Action & Adventure'}]});
    if (p==='movie/42') return response({id:42,title:'Cached film',overview:'',genres:[{id:28,name:'Action'}],release_date:'2099-03-03',credits:{cast:[],crew:[]},videos:{results:[]}});
    if (p==='tv/7/season/1') return response({episodes:[{id:9,name:'Pilot',overview:'',episode_number:1,air_date:null,still_path:null}]});
    return response({});
  });
  const list1=await genres('movie'); const list2=await genres('movie'); assert.deepEqual(list1,list2);
  const title1=await titleById('movie-42'); const title2=await titleById('movie-42'); assert.equal(title1.title,title2.title);
  const season1=await season('tv-7',1); const season2=await season('tv-7',1); assert.deepEqual(season1,season2);
  assert.ok(calls < 8);
  process.env.CATALOG_MODE='demo'; await assert.rejects(()=>titleById('movie-42'),/demo mode/); process.env.CATALOG_MODE='tmdb';
});

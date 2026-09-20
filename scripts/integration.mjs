import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'cinepulse-api-test-'));
const origin='http://127.0.0.1:3102';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3102'],{env:{...process.env,CATALOG_MODE:'demo',DATABASE_PATH:join(directory,'test.db'),APP_ORIGIN:origin,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',d=>{log+=d;});server.stderr.on('data',d=>{log+=d;});
let code=1;
try{
 let ready=false;
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Test server stopped: '+log);try{if((await fetch(origin+'/api/config')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!ready)throw new Error('Test server did not start: '+log);
 const child=spawn(process.execPath,['--import','tsx','--test','tests/integration.test.ts'],{env:{...process.env,TEST_BASE_URL:origin},stdio:'inherit'});
 code=await new Promise(resolve=>child.on('exit',n=>resolve(n??1)));
}catch(error){console.error(error);}
finally{server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));await rm(directory,{recursive:true,force:true});}
process.exitCode=code;

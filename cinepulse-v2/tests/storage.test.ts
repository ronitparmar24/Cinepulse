import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('SQLite data survives a fresh process and startup migrations are repeatable',()=>{
 const folder=mkdtempSync(join(tmpdir(),'cinepulse-storage-'));
 const env={...process.env,DATABASE_PATH:join(folder,'persistent.db')};
 const run=(code:string)=>spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{env,encoding:'utf8'});
 try{
  const first=run(`import {db} from './lib/db.ts'; const d=db(); d.prepare('INSERT INTO users(id,name,email,password_hash,created_at) VALUES(?,?,?,?,?)').run('storage-fixture','Storage test','storage@example.test','test-only-not-a-login-hash',new Date().toISOString()); d.close();`);
  assert.equal(first.status,0,first.stderr);
  const second=run(`import {db} from './lib/db.ts'; const d=db(); const row=d.prepare('SELECT name FROM users WHERE id=?').get('storage-fixture'); console.log(row.name); d.close();`);
  assert.equal(second.status,0,second.stderr);assert.equal(second.stdout.trim(),'Storage test');
 }finally{rmSync(folder,{recursive:true,force:true});}
});

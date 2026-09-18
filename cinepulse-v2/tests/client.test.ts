import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../components/client';
const original=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=original;});
test('an aborted JSON response remains an abort instead of becoming successful undefined catalog data',async()=>{
 globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){controller.error(new DOMException('aborted','AbortError'));}}),{status:200});
 await assert.rejects(()=>api('/catalog'),{name:'AbortError'});
});
test('an unreadable successful response produces a recoverable error',async()=>{
 globalThis.fetch=(async()=>new Response('<html>Not JSON</html>',{status:200})) as typeof fetch;
 await assert.rejects(()=>api('/catalog'),/unreadable response/);
});

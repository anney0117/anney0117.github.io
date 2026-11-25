import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import initOC from 'replicad-opencascadejs';
import {setOC,measureVolume} from 'replicad';
import {downloadEngine} from '../src/engine-loader';
import {CadClient} from '../src/cad-client';
import {clone,demo} from '../src/model';
import {makePrimitive} from '../src/primitives';
import {ENGINE_BYTES,ENGINE_SHA256,readEngineCache,saveEngineCache,discardEngineCache} from '../src/engine-cache';

class FakeWorker {
 messages:any[]=[];terminated=false;
 onmessage:any=null;onerror:any=null;onmessageerror:any=null;
 postMessage(message:any){this.messages.push(message);}
 terminate(){this.terminated=true;}
 emit(message:any){this.onmessage?.({data:message});}
}
const workers:FakeWorker[]=[],events:any[]=[];
const client=new CadClient(()=>{const w=new FakeWorker();workers.push(w);return w as unknown as Worker;},m=>events.push(m),50);
const request=(id:number)=>({type:'build',id,doc:clone(demo)});
client.postMessage(request(1));client.postMessage(request(2));client.postMessage(request(3));
assert.deepEqual(workers[0].messages,[{type:'init'}],'do not build before the engine is ready');
workers[0].emit({type:'ready'});
assert.deepEqual(workers[0].messages.map(m=>m.id),[undefined,3],'build only the latest document after startup');
client.postMessage(request(4));client.postMessage(request(5));
assert.equal(workers[0].messages.length,2,'do not pile up builds in the worker');
workers[0].emit({type:'built',id:3});
assert.equal(workers[0].messages.at(-1).id,5,'skip superseded pending input');
workers[0].emit({type:'built',id:5});
client.postMessage(request(6));workers[0].emit({type:'error',id:6,message:'invalid geometry'});
assert.equal(events.at(-1).type,'error','a geometry error is reported without killing the initialized engine');
client.postMessage(request(7));workers[0].emit({type:'built',id:7});

const recoveryEvents:any[]=[],recoveryWorkers:FakeWorker[]=[];
const recovery=new CadClient(()=>{const w=new FakeWorker();recoveryWorkers.push(w);return w as unknown as Worker;},m=>recoveryEvents.push(m),20);
recovery.postMessage(request(8));
await new Promise(resolve=>setTimeout(resolve,45));
assert.equal(recoveryEvents.at(-1).type,'fatal','silent worker startup must stop waiting');
assert.equal(recoveryWorkers[0].terminated,true);
recovery.postMessage(request(9));
assert.equal(recoveryEvents.at(-1).type,'fatal','editing after a failure keeps the recovery action visible');
recovery.retry();recoveryWorkers[0].emit({type:'ready'});
assert.equal(recoveryWorkers[1].messages.length,1,'ignore late results from terminated workers');
recoveryWorkers[1].emit({type:'ready'});
assert.equal(recoveryWorkers[1].messages.at(-1).id,9,'retry preserves the latest document');
await new Promise(resolve=>setTimeout(resolve,45));
assert.equal(recoveryEvents.at(-1).type,'fatal','a hung build must stop waiting too');
recovery.retry();recoveryWorkers[2].emit({type:'ready'});recoveryWorkers[2].emit({type:'built',id:9});
assert.equal(recoveryEvents.at(-1).type,'built','retry can recover from a timed-out calculation');
console.log('Startup/build timeouts, recovery, latest input and stale worker isolation passed.');

const emptyModule=Buffer.from([0,97,115,109,1,0,0,0]);
const cancelled=new Set<string>();
const server=createServer((req,res)=>{
 if(req.url==='/ok'){res.writeHead(200,{'Content-Length':8});res.write(emptyModule.subarray(0,4));setTimeout(()=>res.end(emptyModule.subarray(4)),5);}
 else if(req.url==='/http-error'){res.writeHead(503);res.end('unavailable');}
 else if(req.url==='/html'){res.end('<html>network error</html>');}
 else if(req.url==='/stall'){res.writeHead(200);res.flushHeaders();}
 else if(req.url==='/race-fast'){
  const timer=setTimeout(()=>res.end(emptyModule),15);res.on('close',()=>clearTimeout(timer));
 }
 else if(req.url==='/race-slow'){
  res.write(emptyModule.subarray(0,4));res.on('close',()=>cancelled.add(req.url!));
 }
 else if(req.url==='/race-stall-prefix'){
  res.write(Buffer.concat([emptyModule,Buffer.alloc(65536-8)]));res.on('close',()=>cancelled.add(req.url!));
 }
 else if(req.url==='/race-wrong')res.end(Buffer.from([0,97,115,109,1,0,0,1]));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
try{
 const progress:any[]=[];const bytes=await downloadEngine(base+'/ok',p=>progress.push(p),1000);
 assert.deepEqual(Buffer.from(bytes),emptyModule);assert.equal(progress.at(-1).loaded,8);
 assert.ok(progress.some(p=>p.loaded===4),'show actual partial download progress');
 assert.ok(await WebAssembly.compile(bytes));
 await assert.rejects(downloadEngine(base+'/http-error',()=>{},1000),/HTTP 503/);
 await assert.rejects(downloadEngine(base+'/html',()=>{},1000),/不完整/);
 await assert.rejects(downloadEngine(base+'/stall',()=>{},35),/下载超过/);
 const expectedHash=createHash('sha256').update(emptyModule).digest('hex');
 let selected:string[]=[];
 assert.deepEqual(Buffer.from(await downloadEngine(base+'/race-fast',()=>{},1000,{
  urls:[base+'/race-slow',base+'/race-fast'],sha256:expectedHash,selected:url=>selected.push(url),
 })),emptyModule);
 assert.deepEqual(selected,[base+'/race-fast'],'continue the first usable stream');
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(cancelled.has('/race-slow'),'cancel the losing connection');
 selected=[];
 assert.deepEqual(Buffer.from(await downloadEngine(base+'/race-fast',()=>{},1000,{
  urls:[base+'/race-wrong',base+'/race-fast'],sha256:expectedHash,selected:url=>selected.push(url),
 })),emptyModule);
 assert.deepEqual(selected,[base+'/race-wrong',base+'/race-fast'],'reject a changed engine and fall back');
 selected=[];
 assert.deepEqual(Buffer.from(await downloadEngine(base+'/race-fast',()=>{},1000,{
  urls:[base+'/race-stall-prefix',base+'/race-fast'],sha256:expectedHash,idleMs:40,selected:url=>selected.push(url),
 })),emptyModule);
 assert.deepEqual(selected,[base+'/race-stall-prefix',base+'/race-fast'],'recover if a selected stream later stops');
 await assert.rejects(downloadEngine(base+'/race-wrong',()=>{},1000,{sha256:expectedHash}),/完整性校验失败/);
 console.log('Real HTTP chunk progress, HTTP errors, invalid engine bytes and stalled download timeout passed.');
 console.log('First-data route selection, loser cancellation, integrity rejection and stalled-route fallback passed.');
}finally{server.closeAllConnections();server.close();}

const cacheEntries=new Map<string,Response>();
const cacheStorage={open:async()=>({
 match:async(url:string)=>cacheEntries.get(url)?.clone(),
 put:async(url:string,response:Response)=>{cacheEntries.set(url,response.clone());},
 delete:async(url:string)=>cacheEntries.delete(url),
})} as unknown as CacheStorage;
const engineUrl='https://example.test/assets/engine-v1.wasm';
assert.equal(await readEngineCache(engineUrl,8,cacheStorage),null,'first visit is a cache miss');
assert.equal(await saveEngineCache(engineUrl,new Uint8Array(emptyModule),cacheStorage),true);
assert.deepEqual(Buffer.from((await readEngineCache(engineUrl,8,cacheStorage))!),emptyModule,'next visit reuses the exact saved binary');
assert.equal(await readEngineCache(engineUrl.replace('v1','v2'),8,cacheStorage),null,'a new engine URL cannot reuse an old version');
assert.equal(await readEngineCache(engineUrl,9,cacheStorage),null,'discard partial cached files');
assert.equal(cacheEntries.has(engineUrl),false);
cacheEntries.set(engineUrl,new Response(new Uint8Array(8)));
assert.equal(await readEngineCache(engineUrl,8,cacheStorage),null,'discard a non-wasm cache entry');
const deniedStorage={open:async()=>{throw new Error('quota or privacy restriction');}} as unknown as CacheStorage;
assert.equal(await readEngineCache(engineUrl,8,deniedStorage),null,'cache restrictions permit normal network loading');
assert.equal(await saveEngineCache(engineUrl,new Uint8Array(emptyModule),deniedStorage),false,'cache failure does not fail the engine');
assert.equal(await readEngineCache(engineUrl,8,undefined),null);
assert.equal(await saveEngineCache(engineUrl,new Uint8Array(emptyModule),undefined),false);
await saveEngineCache(engineUrl,new Uint8Array(emptyModule),cacheStorage);await discardEngineCache(engineUrl,cacheStorage);
assert.equal(cacheEntries.has(engineUrl),false);
console.log('Cache reuse, engine version separation, corrupt/partial entries and unavailable storage passed.');

// Exercise the custom instantiation path against the real OCCT binary.
const require=createRequire(import.meta.url);
const actualEngine=readFileSync(require.resolve('replicad-opencascadejs/wasm'));
assert.equal(actualEngine.length,ENGINE_BYTES,'reported engine size matches the pinned real binary');
assert.equal(createHash('sha256').update(actualEngine).digest('hex'),ENGINE_SHA256,'mirror verification pins the exact current OCCT binary');
const module=await WebAssembly.compile(actualEngine);
const oc=await initOC({instantiateWasm:(imports:WebAssembly.Imports,receive:(instance:WebAssembly.Instance)=>void)=>{
 const instance=new WebAssembly.Instance(module,imports);receive(instance);return instance.exports;
}} as any);
setOC(oc);
const cylinder=makePrimitive({kind:'cylinder',width:60,depth:40,height:50,radius:20});
assert.ok(Math.abs(measureVolume(cylinder)-Math.PI*20**2*50)<1e-6);
console.log('Real OCCT custom WebAssembly initialization and exact cylinder volume passed.');

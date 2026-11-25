import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import initOC from 'replicad-opencascadejs';
import {setOC,measureVolume} from 'replicad';
import {downloadEngine} from '../src/engine-loader';
import {CadClient} from '../src/cad-client';
import {clone,demo} from '../src/model';
import {makePrimitive} from '../src/primitives';

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
const server=createServer((req,res)=>{
 if(req.url==='/ok'){res.writeHead(200,{'Content-Length':8});res.write(emptyModule.subarray(0,4));setTimeout(()=>res.end(emptyModule.subarray(4)),5);}
 else if(req.url==='/http-error'){res.writeHead(503);res.end('unavailable');}
 else if(req.url==='/html'){res.end('<html>network error</html>');}
 else if(req.url==='/stall'){res.writeHead(200);res.flushHeaders();}
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
 console.log('Real HTTP chunk progress, HTTP errors, invalid engine bytes and stalled download timeout passed.');
}finally{server.closeAllConnections();server.close();}

// Exercise the custom instantiation path against the real OCCT binary.
const require=createRequire(import.meta.url);
const module=await WebAssembly.compile(readFileSync(require.resolve('replicad-opencascadejs/wasm')));
const oc=await initOC({instantiateWasm:(imports:WebAssembly.Imports,receive:(instance:WebAssembly.Instance)=>void)=>{
 const instance=new WebAssembly.Instance(module,imports);receive(instance);return instance.exports;
}} as any);
setOC(oc);
const cylinder=makePrimitive({kind:'cylinder',width:60,depth:40,height:50,radius:20});
assert.ok(Math.abs(measureVolume(cylinder)-Math.PI*20**2*50)<1e-6);
console.log('Real OCCT custom WebAssembly initialization and exact cylinder volume passed.');

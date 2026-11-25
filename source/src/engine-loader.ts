export interface DownloadProgress { loaded:number; total:number|null }
interface DeliveryOptions {
 urls?:string[];
 sha256?:string;
 selected?:(url:string)=>void;
 idleMs?:number;
}
interface Candidate {
 url:string;
 controller:AbortController;
 response:Response;
 reader:ReadableStreamDefaultReader<Uint8Array>|null;
 chunks:Uint8Array[];
 loaded:number;
 done:boolean;
 total:number|null;
}

/** Select on the first 64 KiB, cancel the other streams, then finish one file. */
export async function downloadEngine(
 url:string,
 report:(progress:DownloadProgress)=>void,
 timeoutMs=180000,
 options:DeliveryOptions={},
):Promise<Uint8Array<ArrayBuffer>> {
 let remaining=[...new Set(options.urls?.length?options.urls:[url])];
 const deadline=Date.now()+timeoutMs;
 let lastError:unknown=new Error('建模引擎下载失败，请重试。');
 while(remaining.length&&Date.now()<deadline){
  const controllers=new Map<string,AbortController>();
  const timers=new Map<string,{total:ReturnType<typeof setTimeout>;idle:ReturnType<typeof setTimeout>}>();
  const resetIdle=(source:string)=>{
   const timer=timers.get(source);if(!timer)return;
   clearTimeout(timer.idle);
   timer.idle=setTimeout(()=>controllers.get(source)?.abort(),options.idleMs??20000);
  };
  const cancel=(source:string)=>{
   controllers.get(source)?.abort();const timer=timers.get(source);
   if(timer){clearTimeout(timer.total);clearTimeout(timer.idle);timers.delete(source);}
  };
  let chosen:Candidate|undefined;
  try{
   const probe=async(source:string):Promise<Candidate>=>{
    const controller=new AbortController();controllers.set(source,controller);
    timers.set(source,{
     total:setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now())),
     idle:setTimeout(()=>controller.abort(),options.idleMs??20000),
    });
    const response=await fetch(source,{signal:controller.signal});
    if(!response.ok)throw new Error(`建模引擎下载失败（HTTP ${response.status}）。`);
    resetIdle(source);
    const length=Number(response.headers.get('content-length'));
    const candidate:Candidate={url:source,controller,response,reader:response.body?.getReader()??null,chunks:[],loaded:0,done:false,total:!response.headers.get('content-encoding')&&length>0?length:null};
    // With a single source, preserve normal streaming progress without a probe.
    if(remaining.length>1&&candidate.reader){
     while(candidate.loaded<65536){
      const {value,done}=await candidate.reader.read();candidate.done=done;if(done)break;
      candidate.chunks.push(value);candidate.loaded+=value.byteLength;resetIdle(source);
      const prefix=candidate.chunks[0];
      if(prefix.length>=4&&(prefix[0]!==0||prefix[1]!==97||prefix[2]!==115||prefix[3]!==109))
       throw new Error('下载线路返回了错误页面。');
     }
    }
    return candidate;
   };
   try{chosen=await Promise.any(remaining.map(probe));}catch(err){
    lastError=err;
    if(remaining.length===1&&err instanceof AggregateError)lastError=err.errors[0];
    remaining=[];continue;
   }
   for(const source of controllers.keys())if(source!==chosen.url)cancel(source);
   options.selected?.(chosen.url);
   const total=chosen.total;let loaded=chosen.loaded;
   if(loaded>50*1024*1024)throw new Error('建模引擎文件大小异常。');
   report({loaded,total});
   if(chosen.reader){
    while(!chosen.done){
     const {done,value}=await chosen.reader.read();chosen.done=done;if(done)break;
     chosen.chunks.push(value);loaded+=value.byteLength;resetIdle(chosen.url);
     if(loaded>50*1024*1024)throw new Error('建模引擎文件大小异常。');
     report({loaded,total:total&&total>=loaded?total:null});
    }
   }else{const bytes=new Uint8Array(await chosen.response.arrayBuffer());chosen.chunks.push(bytes);loaded=bytes.length;}
   const bytes=new Uint8Array(loaded);let offset=0;
   for(const chunk of chosen.chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   if(bytes.length<8||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)
    throw new Error('建模引擎文件不完整或被错误页面替代，请重试。');
   if(options.sha256){
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==options.sha256)throw new Error('建模引擎完整性校验失败，已拒绝使用该下载结果。');
   }
   report({loaded,total:loaded});return bytes;
  }catch(err){
   lastError=err;
   const failedUrl=chosen?.url;
   remaining=failedUrl?remaining.filter(source=>source!==failedUrl):[];
  }finally{for(const source of controllers.keys())cancel(source);}
 }
 if(Date.now()>=deadline||lastError instanceof Error&&lastError.name==='AbortError')
  throw new Error('建模引擎下载超过等待时间，请检查网络后重试。');
 if(lastError instanceof Error&&!(lastError instanceof AggregateError))throw lastError;
 throw new Error('下载线路暂时不可用，请检查网络后重试。');
}

// Pinned replicad-opencascadejs 1.2.1 binary; checked against the real file in tests.
export const ENGINE_BYTES=22942327;
export const ENGINE_SHA256='a9335919fa64bfeaee3e241d3139ad134022682429c6688e20d8ca12093d33d9';
const CACHE_NAME='zhungou-occt-v1';

async function bounded<T>(operation:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>reject(new Error('Engine cache unavailable')),4000);
 })]);}finally{clearTimeout(timer);}
}

export async function readEngineCache(url:string,expectedBytes:number,storage?:CacheStorage):Promise<Uint8Array<ArrayBuffer>|null>{
 if(!storage)return null;
 try{return await bounded((async()=>{
  const cache=await storage.open(CACHE_NAME),response=await cache.match(url);
  if(!response)return null;
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==expectedBytes||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109){
   await cache.delete(url);return null;
  }
  return bytes;
 })());}catch{return null;}
}

export async function saveEngineCache(url:string,bytes:Uint8Array<ArrayBuffer>,storage?:CacheStorage):Promise<boolean>{
 if(!storage)return false;
 try{await bounded((async()=>{
  const cache=await storage.open(CACHE_NAME);
  await cache.put(url,new Response(bytes,{headers:{'Content-Type':'application/wasm'}}));
 })());return true;}catch{return false;}
}

export async function discardEngineCache(url:string,storage?:CacheStorage):Promise<void>{
 if(!storage)return;
 try{await bounded((async()=>{await (await storage.open(CACHE_NAME)).delete(url);})());}catch{/* Network loading remains available. */}
}

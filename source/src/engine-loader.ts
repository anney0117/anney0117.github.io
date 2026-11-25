export interface DownloadProgress { loaded:number; total:number|null }

/** Read the engine with a finite deadline and report actual decoded bytes. */
export async function downloadEngine(
 url:string,
 report:(progress:DownloadProgress)=>void,
 timeoutMs=180000,
):Promise<Uint8Array<ArrayBuffer>> {
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try {
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw new Error(`建模引擎下载失败（HTTP ${response.status}）。`);
  const length=Number(response.headers.get('content-length'));
  const total=!response.headers.get('content-encoding')&&length>0?length:null;
  const chunks:Uint8Array[]=[];let loaded=0;
  report({loaded,total});
  if(response.body){
   const reader=response.body.getReader();
   while(true){
    const {done,value}=await reader.read();if(done)break;
    chunks.push(value);loaded+=value.byteLength;
    if(loaded>50*1024*1024){controller.abort();throw new Error('建模引擎文件大小异常。');}
    report({loaded,total:total&&total>=loaded?total:null});
   }
  }else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);loaded=bytes.length;}
  const bytes=new Uint8Array(loaded);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  if(bytes.length<8||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)
   throw new Error('建模引擎文件不完整或被错误页面替代，请重试。');
  report({loaded,total:loaded});return bytes;
 }catch(err){
  if(controller.signal.aborted&&!(err instanceof Error&&err.message==='建模引擎文件大小异常。'))
   throw new Error('建模引擎下载超过 3 分钟，请检查网络后重试。');
  throw err;
 }finally{clearTimeout(timeout);}
}

import initOC from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import {setOC,getOC,measureVolume,drawProjection,type Shape3D} from 'replicad';
import {getSlices,type Document,type Feature} from './model';
import {makePrimitive} from './primitives';
import {applySlices} from './slice';
import {downloadEngine} from './engine-loader';
import {ENGINE_BYTES,ENGINE_SHA256,readEngineCache,saveEngineCache,discardEngineCache} from './engine-cache';
let loaded:Promise<void>|undefined;
let currentShape:Shape3D|undefined;
function init(){return loaded??=(async()=>{
 let lastProgress=0;
 const storage=typeof caches==='undefined'?undefined:caches;
 postMessage({type:'progress',phase:'cache'});
 let bytes=await readEngineCache(wasmUrl,ENGINE_BYTES,storage);
 let fromCache=bytes!==null;
 let delivery='';
 const download=()=>{postMessage({type:'progress',phase:'connecting'});return downloadEngine(wasmUrl,p=>{
  const now=Date.now();
  if(p.loaded===0||p.loaded===p.total||now-lastProgress>=100){lastProgress=now;postMessage({type:'progress',phase:'download',...p,total:ENGINE_BYTES});}
 },180000,{
  urls:[
   wasmUrl,
   'https://cdn.jsdmirror.com/npm/replicad-opencascadejs@1.2.1/dist/replicad_single.wasm',
   'https://cdn.jsdelivr.net/npm/replicad-opencascadejs@1.2.1/dist/replicad_single.wasm',
  ],
  sha256:ENGINE_SHA256,
  selected:url=>{delivery=url;},
 });};
 if(!bytes)bytes=await download();
 if(bytes.length!==ENGINE_BYTES)throw new Error('建模引擎下载不完整，请重试。');
 postMessage({type:'progress',phase:'compile',source:fromCache?'cache':'network'});
 let module:WebAssembly.Module;
 try{module=await WebAssembly.compile(bytes);}catch(err){
  if(!fromCache)throw err;
  await discardEngineCache(wasmUrl,storage);fromCache=false;bytes=await download();
  if(bytes.length!==ENGINE_BYTES)throw new Error('建模引擎下载不完整，请重试。');
  postMessage({type:'progress',phase:'compile',source:'network'});
  module=await WebAssembly.compile(bytes);
 }
 // This generated OCCT factory supports instantiateWasm, but ignores wasmBinary.
 // Supplying the compiled module avoids a second download by the factory.
 const options={locateFile:()=>wasmUrl,instantiateWasm:(imports:WebAssembly.Imports,receive:(instance:WebAssembly.Instance,module:WebAssembly.Module)=>void)=>{
  const instance=new WebAssembly.Instance(module,imports);receive(instance,module);return instance.exports;
 }};
 const oc=await initOC(options);setOC(oc);
 let cached=fromCache;
 if(!cached){postMessage({type:'progress',phase:'saving'});cached=await saveEngineCache(wasmUrl,bytes,storage);}
 postMessage({type:'ready',source:fromCache?'cache':'network',cached,delivery});
})()}
function tool(f:Feature):Shape3D {return makePrimitive(f).translate(f.x,f.y,f.z)}
function build(doc:Document):Shape3D { let shape=makePrimitive({kind:doc.baseKind??'box',width:doc.width,depth:doc.depth,height:doc.height,radius:doc.radius??20,topRadius:doc.topRadius,tubeRadius:doc.tubeRadius}); for(const f of doc.features){if(!f.enabled)continue;const operand=tool(f);shape=f.operation==='cut'?shape.cut(operand):f.operation==='fuse'?shape.fuse(operand):shape.intersect(operand);if(shape.isNull)throw new Error('布尔运算生成了空实体，请检查操作形体的位置与尺寸。')}
 shape=applySlices(shape,getSlices(doc));
 const checker=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,true);const valid=checker.IsValid();checker.delete();if(!valid)throw new Error('实体拓扑或几何校验未通过，请撤销当前操作。');return shape }
function projections(shape:Shape3D){ const views={} as Record<string,{visible:string[];hidden:string[];viewBox:string}>;for(const [key,plane] of [['front','front'],['top','top'],['right','right']] as const){const p=drawProjection(shape,plane);const vis=p.visible.toSVGPaths().flat() as string[];const hid=p.hidden.toSVGPaths().flat() as string[];views[key]={visible:vis,hidden:hid,viewBox:p.visible.toSVGViewBox(5)} }return views }
self.onmessage=async(e:MessageEvent)=>{const {type,id,doc}=e.data as {type:string;id:number;doc?:Document};try{await init();if(type==='build'&&doc){const shape=build(doc);const faces=shape.mesh({tolerance:0.08,angularTolerance:15});const edges=shape.meshEdges({tolerance:0.08,angularTolerance:15});const bounds=shape.boundingBox.bounds;const volume=measureVolume(shape);const views=projections(shape);currentShape=shape;postMessage({type:'built',id,faces,edges,bounds,volume,views,solidCount:shape.solids.length})}if(type==='export'&&currentShape){const blob=e.data.format==='step'?currentShape.blobSTEP():currentShape.blobSTL({binary:true});postMessage({type:'exported',id,format:e.data.format,blob})}}catch(err){console.error(err instanceof Error?err.stack:String(err));postMessage({type:type==='init'?'fatal':'error',id,message:err instanceof Error?err.message:String(err)})}}

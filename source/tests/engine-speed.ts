// Optional live network measurement; not a phone or mainland-China benchmark.
import {downloadEngine} from '../src/engine-loader';
import {ENGINE_BYTES,ENGINE_SHA256} from '../src/engine-cache';
const urls=[
 'https://anney0117.github.io/assets/replicad_single-g5eiaENB.wasm',
 'https://cdn.jsdmirror.com/npm/replicad-opencascadejs@1.2.1/dist/replicad_single.wasm',
 'https://cdn.jsdelivr.net/npm/replicad-opencascadejs@1.2.1/dist/replicad_single.wasm',
];
const started=performance.now();let selected='';
const bytes=await downloadEngine(urls[0],()=>{},180000,{urls,sha256:ENGINE_SHA256,selected:url=>selected=url});
if(bytes.length!==ENGINE_BYTES)throw new Error('Unexpected engine size');
console.log(JSON.stringify({selected,bytes:bytes.length,seconds:Number(((performance.now()-started)/1000).toFixed(2)),integrity:'verified'},null,2));

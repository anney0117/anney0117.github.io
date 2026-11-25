import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import initOC from 'replicad-opencascadejs';
import {setOC,measureVolume,getOC,drawProjection} from 'replicad';
import {makePrimitive} from '../src/primitives';
import {demo,validDocument,type ToolKind} from '../src/model';
const require=createRequire(import.meta.url);
const oc=await initOC({wasmBinary:readFileSync(require.resolve('replicad-opencascadejs/wasm'))});setOC(oc);
const params={width:60,depth:40,height:50,radius:20,topRadius:10,tubeRadius:5};
const expected:Record<ToolKind,number>={box:60*40*50,cylinder:Math.PI*20**2*50,cone:Math.PI*20**2*50/3,frustum:Math.PI*50*(20**2+20*10+10**2)/3,sphere:4*Math.PI*20**3/3,torus:2*Math.PI**2*20*5**2};
for(const kind of Object.keys(expected) as ToolKind[]){
 const shape=makePrimitive({...params,kind});
 const checker=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,true);assert.ok(checker.IsValid(),kind+' valid solid');checker.delete();
 const v=measureVolume(shape);assert.ok(Math.abs(v-expected[kind])/expected[kind]<1e-7,`${kind}: ${v} vs ${expected[kind]}`);
 for(const view of ['front','top','right'] as const){const drawing=drawProjection(shape,view);assert.ok(drawing.visible.toSVGPaths().flat().length>0,kind+' '+view+' projection')}
 assert.ok(shape.blobSTEP().size>1000,kind+' STEP');
 const split=shape.split('YZ',0);assert.ok(split.positive&&split.negative,kind+' split both');assert.ok(Math.abs(measureVolume(split.positive!)-v/2)/v<1e-7,kind+' half volume');
 console.log(`${kind}: volume=${v.toFixed(5)}, valid, 3 projections, STEP, half-split passed`);
}
const cone=makePrimitive({...params,kind:'cone'});
const bore=makePrimitive({...params,kind:'cylinder',radius:3,height:60}).translate(0,0,-5);
const cut=cone.cut(bore);assert.ok(measureVolume(cut)<expected.cone&&measureVolume(cut)>0);
assert.ok(validDocument(demo),'legacy project remains valid');
for(const kind of Object.keys(expected) as ToolKind[]){const doc={...demo,baseKind:kind,...params,features:[]};assert.ok(validDocument(JSON.parse(JSON.stringify(doc))),kind+' project roundtrip')}
assert.equal(validDocument({...demo,baseKind:'torus',radius:5,tubeRadius:5}),false,'reject invalid torus');
console.log('Cone boolean cut, old/new project compatibility and invalid torus checks passed.');

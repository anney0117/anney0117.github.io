import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import initOC from 'replicad-opencascadejs';
import {setOC,makeBaseBox,measureVolume,getOC,drawProjection} from 'replicad';
import {splitWithAngles,applySlice,applySlices,sliceFrame} from '../src/slice';
import {demo,validDocument,type Slice} from '../src/model';
const require=createRequire(import.meta.url);
const oc=await initOC({wasmBinary:readFileSync(require.resolve('replicad-opencascadejs/wasm'))});setOC(oc);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
const cube=()=>makeBaseBox(2,2,2);
const slice:Slice={enabled:true,axis:'X',offset:1,angleZ:45,side:'positive'};
// x+y=1 removes a right triangular prism of area 1/2 and height 2 from [-1,1]^2 x [0,2].
const parts=splitWithAngles(cube(),slice);close(measureVolume(parts.positive!),1);close(measureVolume(parts.negative!),7);
for(const [side,volume,solids] of [['positive',1,1],['negative',7,1],['both',8,2]] as const){
 const shape=applySlice(cube(),{...slice,side});close(measureVolume(shape),volume);assert.equal(shape.solids.length,solids);
 const check=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,true);assert.ok(check.IsValid());check.delete();
 assert.ok(shape.blobSTEP().size>1000);
 for(const view of ['front','top','right'] as const)assert.ok(drawProjection(shape,view).visible.toSVGPaths().flat().length>0);
}
// Opposite angle produces the opposite diagonal and the same known wedge volume.
close(measureVolume(applySlice(cube(),{...slice,angleZ:-45})),1);
// Horizontal Z=1 plane tilted 45 degrees about X: z-y=1 bisects the cube.
close(measureVolume(applySlice(cube(),{...slice,axis:'Z',offset:1,angleX:45,angleZ:0})),4);
const frame=sliceFrame({...slice,axis:'Z',angleX:90,angleY:90,angleZ:0});close(frame.normal[0],0);close(frame.normal[1],-1);close(frame.normal[2],0);
for(const axis of ['X','Y','Z'] as const){const offset=axis==='Z'?1:0;close(measureVolume(applySlice(cube(),{enabled:true,axis,offset,side:'positive'})),4)}
assert.ok(validDocument(demo));assert.ok(validDocument({...demo,slice}));assert.ok(validDocument(JSON.parse(JSON.stringify({...demo,slice}))));
for(const angleZ of [NaN,Infinity,361,-361,'45'])assert.equal(validDocument({...demo,slice:{...slice,angleZ}}),false);
console.log('45° positive/negative wedge 1/7 mm³, both=8 mm³/2 solids; tilted Z half=4 mm³; rotations, 3 views, STEP, legacy and parameter validation passed.');

const repeated:Slice[]=[{enabled:true,axis:'X',offset:-10,side:'both'},{enabled:true,axis:'X',offset:10,side:'both'}];
const block=()=>makeBaseBox(60,40,20);
const three=applySlices(block(),repeated);assert.equal(three.solids.length,3);close(measureVolume(three),48000);
const sequence=[...repeated,{enabled:true,axis:'Z',offset:10,angleX:30,side:'both'} as Slice];
const six=applySlices(block(),sequence);assert.equal(six.solids.length,6);close(measureVolume(six),48000);
assert.equal(applySlices(block(),[{...repeated[0],enabled:false},repeated[1]]).solids.length,2);
const multiDoc={...demo,slice:sequence[0],additionalSlices:sequence.slice(1)};
assert.ok(validDocument(JSON.parse(JSON.stringify(multiDoc))));
assert.equal(validDocument({...multiDoc,additionalSlices:[{...sequence[0],angleX:Infinity}]}),false);
assert.equal(validDocument({...multiDoc,additionalSlices:Array(20).fill(sequence[0])}),false);
assert.ok(six.blobSTEP().size>1000);
console.log('2 parallel knives => 3 solids; +30° third knife => 6 solids, 48000 mm³ conserved; disabled knife, multiple-knife JSON and STEP passed.');

import {Plane,makeCompound,measureShapeVolumeProperties,type Shape3D} from 'replicad';
import type {Slice} from './model';
import {sliceFrame} from './slice-frame';
export {sliceFrame} from './slice-frame';
export function splitWithAngles(shape:Shape3D,slice:Slice){
 const frame=sliceFrame(slice);const plane=new Plane(frame.point,frame.u,frame.normal);
 try{
  const result=shape.split(plane,0);
  // Bounding-box centres can lie on an oblique cut even for a nonzero wedge.
  // Reclassify every solid by its volume centroid, which stays in its half-space.
  const groups:{positive:Shape3D[];negative:Shape3D[]}={positive:[],negative:[]};
  for(const group of [result.positive,result.negative,result.on]){
   if(!group)continue;
   for(const solid of group.solids){const props=measureShapeVolumeProperties(solid),center=props.centerOfMass;props.delete();
    const distance=center.reduce((sum,v,i)=>sum+(v-frame.point[i])*frame.normal[i],0);
    groups[distance>=0?'positive':'negative'].push(solid);
   }
  }
  const combine=(pieces:Shape3D[])=>pieces.length===0?null:pieces.length===1?pieces[0]:makeCompound(pieces).asShape3D();
  return {positive:combine(groups.positive),negative:combine(groups.negative)};
 }finally{plane.delete()}
}
export function applySlice(shape:Shape3D,slice:Slice):Shape3D{
 if(!slice.enabled)return shape;
 const pieces=splitWithAngles(shape,slice);
 const selected=slice.side==='positive'?pieces.positive:slice.side==='negative'?pieces.negative:pieces.positive&&pieces.negative?makeCompound([pieces.positive,pieces.negative]).asShape3D():pieces.positive??pieces.negative;
 if(!selected)throw new Error('当前切割位置和角度没有生成可保留的实体，请检查参数。');
 return selected.asShape3D();
}

export function applySlices(shape:Shape3D,slices:Slice[]):Shape3D{let current=shape;for(const slice of slices)current=applySlice(current,slice);return current}

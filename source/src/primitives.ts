import {makeBaseBox,makeCylinder,makeSphere,Sketcher,cast,getOC,type Shape3D} from 'replicad';
import type {ToolKind} from './model';
export interface PrimitiveParameters {kind:ToolKind; width:number;depth:number;height:number;radius:number;topRadius?:number;tubeRadius?:number}
export function makePrimitive(p:PrimitiveParameters):Shape3D {
  if(p.kind==='box')return makeBaseBox(p.width,p.depth,p.height);
  if(p.kind==='cylinder')return makeCylinder(p.radius,p.height);
  if(p.kind==='sphere')return makeSphere(p.radius);
  if(p.kind==='torus'){
    const maker=new (getOC().BRepPrimAPI_MakeTorus)(p.radius,p.tubeRadius??3);
    const shape=cast(maker.Shape()).asShape3D();maker.delete();return shape;
  }
  const top=p.kind==='cone'?0:(p.topRadius??5);
  if(Math.abs(top-p.radius)<1e-9)return makeCylinder(p.radius,p.height);
  const section=new Sketcher('XZ').movePointerTo([0,0]).lineTo([p.radius,0]).lineTo([top,p.height]);
  if(top>0)section.lineTo([0,p.height]);
  return section.close().revolve('Z');
}

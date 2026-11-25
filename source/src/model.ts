export type ToolKind = 'box' | 'cylinder' | 'cone' | 'frustum' | 'sphere' | 'torus';
export type Operation = 'cut' | 'fuse' | 'intersect';
export type Axis = 'X' | 'Y' | 'Z';
export type Side = 'positive' | 'negative' | 'both';
export interface Feature { id:string; kind:ToolKind; operation:Operation; x:number; y:number; z:number; width:number; depth:number; height:number; radius:number; topRadius?:number; tubeRadius?:number; enabled:boolean }
export interface Slice { enabled:boolean; axis:Axis; offset:number; angleX?:number; angleY?:number; angleZ?:number; side:Side }
export interface Document { version:1; name:string; width:number; depth:number; height:number; baseKind?:ToolKind; radius?:number; topRadius?:number; tubeRadius?:number; features:Feature[]; slice:Slice; additionalSlices?:Slice[] }
export const demo:Document={version:1,name:'精密安装板',width:100,depth:60,height:10,features:[{id:'hole-a',kind:'cylinder',operation:'cut',x:-28,y:0,z:0,width:10,depth:10,height:10,radius:5,enabled:true},{id:'hole-b',kind:'cylinder',operation:'cut',x:28,y:0,z:0,width:10,depth:10,height:10,radius:5,enabled:true}],slice:{enabled:false,axis:'X',offset:0,side:'both'}};
export const kinds:ToolKind[]=['box','cylinder','cone','frustum','sphere','torus'];
export const kindLabels:Record<ToolKind,string>={box:'长方体',cylinder:'圆柱',cone:'圆锥',frustum:'圆台',sphere:'球体',torus:'圆环'};
function validPrimitive(p:{kind:ToolKind;radius:number;topRadius?:number;tubeRadius?:number}){
 return kinds.includes(p.kind)&&Number.isFinite(p.radius)&&p.radius>0&&p.radius<=100000&&
 (p.topRadius===undefined||Number.isFinite(p.topRadius)&&p.topRadius>0&&p.topRadius<=100000)&&
 (p.tubeRadius===undefined||Number.isFinite(p.tubeRadius)&&p.tubeRadius>0)&&
 (p.kind!=='torus'||(p.tubeRadius??3)<p.radius);
}
export function validSlice(s:any):s is Slice{return !!s&&typeof s.enabled==='boolean'&&['X','Y','Z'].includes(s.axis)&&Number.isFinite(s.offset)&&[s.angleX,s.angleY,s.angleZ].every(a=>a===undefined||Number.isFinite(a)&&Math.abs(a)<=360)&&['positive','negative','both'].includes(s.side)}
export function getSlices(doc:Document):Slice[]{return [doc.slice,...(doc.additionalSlices??[])]}
export function validDocument(raw:any):raw is Document {
 return !!raw&&raw.version===1&&typeof raw.name==='string'&&
 [raw.width,raw.depth,raw.height].every(v=>Number.isFinite(v)&&v>0&&v<=100000)&&
 validPrimitive({kind:raw.baseKind??'box',radius:raw.radius??20,topRadius:raw.topRadius,tubeRadius:raw.tubeRadius})&&
 Array.isArray(raw.features)&&raw.features.length<=40&&raw.features.every((f:any)=>
 typeof f.id==='string'&&validPrimitive(f)&&['cut','fuse','intersect'].includes(f.operation)&&
 [f.x,f.y,f.z,f.width,f.depth,f.height].every(Number.isFinite)&&f.width>0&&f.depth>0&&f.height>0)&&
 validSlice(raw.slice)&&(raw.additionalSlices===undefined||Array.isArray(raw.additionalSlices)&&raw.additionalSlices.length<20&&raw.additionalSlices.every(validSlice));
}
export function clone(doc:Document):Document{return JSON.parse(JSON.stringify(doc))}

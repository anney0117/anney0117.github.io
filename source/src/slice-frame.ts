import type {Slice} from './model';
type V3=[number,number,number];
/** The anchor stays on the selected reference axis; rotations use fixed world axes X, Y, then Z. */
export function sliceFrame(slice:Slice){
 const toRad=(v:number|undefined)=>(v??0)*Math.PI/180;
 const [a,b,c]=[toRad(slice.angleX),toRad(slice.angleY),toRad(slice.angleZ)];
 const start:V3=slice.axis==='X'?[1,0,0]:slice.axis==='Y'?[0,1,0]:[0,0,1];
 const p:V3=[start[0]*slice.offset,start[1]*slice.offset,start[2]*slice.offset];
 const [x,y,z]=start;
 const afterX:V3=[x,y*Math.cos(a)-z*Math.sin(a),y*Math.sin(a)+z*Math.cos(a)];
 const afterY:V3=[afterX[0]*Math.cos(b)+afterX[2]*Math.sin(b),afterX[1],-afterX[0]*Math.sin(b)+afterX[2]*Math.cos(b)];
 const normal:V3=[afterY[0]*Math.cos(c)-afterY[1]*Math.sin(c),afterY[0]*Math.sin(c)+afterY[1]*Math.cos(c),afterY[2]];
 // Choose a reference direction away from parallel to the normal.
 const ref:V3=Math.abs(normal[2])<0.9?[0,0,1]:[0,1,0];
 const cross=(u:V3,v:V3):V3=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 const raw=cross(ref,normal),length=Math.hypot(...raw);
 const u:V3=[raw[0]/length,raw[1]/length,raw[2]/length];
 const v=cross(normal,u);
 return {point:p,normal,u,v};
}

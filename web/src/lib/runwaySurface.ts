import type * as Cesium from 'cesium';
import type {Runway} from '../types.ts';
import {readWeatherAudio} from './weatherAudio.ts';
import {runwayLightPoints} from './runwayDetails.ts';
/** Illustrative wear on mapped pavement. Wetness responds to local precipitation, not reported runway condition. */
export function runwaySurfaceCorners(r:Runway){
 if(!runwayLightPoints(r).length)return [];
 const cos=Math.cos((r.a[1]+r.b[1])/2*Math.PI/180),dx=((r.b[0]-r.a[0]+540)%360)-180,dy=r.b[1]-r.a[1],length=Math.hypot(dx*cos,dy);
 const point=(p:number[],side:number)=>[((p[0]-dy/length*side*r.width/2/111120/cos+540)%360)-180,p[1]+dx*cos/length*side*r.width/2/111120] as [number,number];
 return [point(r.a,-1),point(r.b,-1),point(r.b,1),point(r.a,1)];
}
const registered=new WeakSet<object>();
export function runwaySurfaceMaterial(C:typeof Cesium,viewer:Cesium.Viewer){
 if(!registered.has(C.Material)){new C.Material({fabric:{type:'SkywardRunwaySurface',uniforms:{wet:0},source:`
 float grain(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
 czm_material czm_getMaterial(czm_materialInput surface){czm_material m=czm_getDefaultMaterial(surface);vec2 uv=surface.st;
 float g=grain(floor(uv*vec2(220.,850.)));float edge=1.-smoothstep(.28,.49,abs(uv.x-.5));
 float ends=exp(-pow((uv.y-.18)*8.,2.))+exp(-pow((uv.y-.82)*8.,2.));
 float tracks=(1.-smoothstep(.013,.06,abs(abs(uv.x-.5)-.13)))*ends;
 float patches=smoothstep(.68,.88,grain(floor(uv*vec2(9.,28.))));
 m.diffuse=mix(vec3(.24,.25,.26),vec3(.09,.11,.13),wet*.55)+vec3(g*.035)-vec3(tracks*.075);
 m.specular=wet*(.1+patches*.4);m.shininess=20.+wet*60.;m.alpha=(.18+tracks*.2+wet*patches*.15)*edge;return m;}`},translucent:true});registered.add(C.Material);}
 let wet=0,last=performance.now();
 return {isConstant:false,definitionChanged:new C.Event(),getType:()=> 'SkywardRunwaySurface',getValue:(_time:unknown,result:{wet?:number}={})=>{const now=performance.now(),target=readWeatherAudio(viewer)?.rain??0;wet+=(target-wet)*(1-Math.exp(-Math.min(1,(now-last)/1000)/4));last=now;result.wet=wet;return result;},equals(other:unknown){return other===this;}} as unknown as Cesium.MaterialProperty;
}

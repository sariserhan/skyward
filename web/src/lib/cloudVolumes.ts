import {cloudFormationIndex,cloudWidth,cloudLobes,type CloudFormation} from './cloudFormation.ts';
import type * as Cesium from 'cesium';
// A bounded local volume, sampled in its own east/north/up frame. Unlike a
// billboard its silhouette and lit upper surface change with camera elevation.
const vertex=`in vec3 position3DHigh;in vec3 position3DLow;in float batchId;
out vec3 v_positionEC;
void main(){vec4 p=czm_computePosition();v_positionEC=(czm_modelViewRelativeToEye*p).xyz;gl_Position=czm_modelViewProjectionRelativeToEye*p;}`;
export function cloudVolumeFragment(steps:number){return `
in vec3 v_positionEC;
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 cloudNormal;
float density(vec3 p){
 // Different centers and radii for every stable cell, including stratiform banks.
 float variant=cloudParameters().x;
 vec3 r0=cloudRadiusA(),r1=cloudRadiusB(),r2=cloudRadiusC(),r3=cloudRadiusD();
 vec3 q0=(p-cloudCenterA())/r0,q1=(p-cloudCenterB())/r1,q2=(p-cloudCenterC())/r2,q3=(p-cloudCenterD())/r3;
 vec4 shapes=vec4(1.0-dot(q0,q0),1.0-dot(q1,q1),1.0-dot(q2,q2),1.0-dot(q3,q3));
 float shape=max(max(shapes.x,shapes.y),max(shapes.z,shapes.w));
 // Blend lobe normals so overlapping puffs don't form hard lighting seams.
 vec4 weights=exp((shapes-vec4(shape))*5.0);
 cloudNormal=normalize(q0/r0*weights.x+q1/r1*weights.y+q2/r2*weights.z+q3/r3*weights.w+vec3(0,0,.0001));
 if(cloudShape()>2.5){vec3 anvil=(p-vec3(.08,0,.50))/vec3(.88,.78,.32);float cap=1.0-dot(anvil,anvil);float blend=smoothstep(-.15,.15,cap-shape);cloudNormal=normalize(mix(cloudNormal,normalize(anvil/vec3(.88,.78,.32)+vec3(0,0,.001)),blend));shape=max(shape,cap);}
 if(cloudShape()>1.5&&cloudShape()<2.5){
  float fibers=noise3(p*vec3(2.0,18.0,3.0)+variant*99.0);
  return smoothstep(.0,.4,shape)*smoothstep(.3,.8,fibers)*.35;
 }
 float n=noise3(p*7.0+variant*99.0);
 if(cloudSamples()>6.0)n=n*.6+noise3(p*19.0+variant*99.0)*.4;
 return smoothstep(.02,.32,shape-(1.0-n)*1.05)*smoothstep(-.96,-.78,p.z);
}
void main(){
 vec3 origin=(czm_inverseModelView*vec4(0,0,0,1)).xyz;
 vec3 exitPoint=(czm_inverseModelView*vec4(v_positionEC,1)).xyz;
 vec3 dir=normalize(exitPoint-origin),inv=1.0/(sign(dir)*max(abs(dir),vec3(.00001))+vec3(.0000001));
 vec3 a=(-vec3(1)-origin)*inv,b=(vec3(1)-origin)*inv,lo=min(a,b),hi=max(a,b);
 float begin=max(0.0,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));if(end<=begin)discard;
 float sampleCount=clamp(cloudSamples(),4.0,float(${steps}));float stepSize=(end-begin)/sampleCount;vec4 sum=vec4(0);
 // Transform the real scene sun into this cloud's local frame, including its scale.
 vec3 sunlight=normalize((czm_inverseModelView*vec4(czm_sunDirectionEC,0)).xyz);
 float elevation=dot(normalize(czm_modelView[2].xyz),czm_sunDirectionEC);
 float day=smoothstep(-.12,.08,elevation);
 float warm=(1.0-smoothstep(.02,.4,elevation))*day;
 vec3 sunColor=mix(vec3(1.0,.99,.96),vec3(1.0,.65,.38),warm*.65);
 // Stable local noise: no screen-space randomization or time-driven swimming.
 for(int i=0;i<${steps};i++){
  if(float(i)>=sampleCount)break;
  vec3 p=origin+dir*(begin+(float(i)+.5)*stepSize);float d=density(p);
  if(d>.01){float facing=max(0.0,dot(normalize(czm_normal*cloudNormal),czm_sunDirectionEC));
   // A short sunward density probe shades the interior of each puff.
   float occlusion=sampleCount>6.0?density(p+sunlight*.18):d*.5;
   float light=(.25+.75*facing)*exp(-occlusion*.85);
   float forward=pow(max(0.0,dot(normalize(v_positionEC),czm_sunDirectionEC)),6.0);
   float rim=forward*.22*(1.0-occlusion*.5);
   vec3 base=(mix(vec3(.43,.49,.58),sunColor,light)+sunColor*rim*day)
     *mix(1.0,.58,cloudParameters().z)*mix(.32,1.0,day);
   float alpha=1.0-exp(-d*stepSize*7.0);sum.rgb+=(1.0-sum.a)*alpha*base;sum.a+=(1.0-sum.a)*alpha;if(sum.a>.985)break;
  }
 }
 if(sum.a<.015)discard;out_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a*cloudVisibility()*(1.0-smoothstep(70000.0,100000.0,length(v_positionEC))));
}`;}
export function addCloudVolume(C:typeof Cesium,collection:Cesium.PrimitiveCollection,options:{lon:number;lat:number;base:number;thickness:number;size:number;formation?:CloudFormation;seed:number;night:boolean;storm:boolean;wet?:boolean;low:boolean;distant?:boolean}){
 const lobes=cloudLobes(options.formation??'cumulus',options.seed),morphology=Object.fromEntries(lobes.flatMap((l,i)=>[[`center${'ABCD'[i]}`,C.Cartesian3.fromArray(l.center)],[`radius${'ABCD'[i]}`,C.Cartesian3.fromArray(l.radius)]]));
 const o={...options,size:cloudWidth(options.size,options.formation??'cumulus',options.distant)},center=C.Cartesian3.fromDegrees(o.lon,o.lat,o.base+o.thickness*.5),frame=C.Transforms.eastNorthUpToFixedFrame(center);
 const matrix=C.Matrix4.multiplyByScale(frame,new C.Cartesian3(o.size*.65,o.size*.55,o.thickness*.55),new C.Matrix4());
 return collection.add(new C.Primitive({geometryInstances:new C.GeometryInstance({id:'weather-cloud-volume',geometry:C.BoxGeometry.fromDimensions({dimensions:new C.Cartesian3(2,2,2),vertexFormat:C.VertexFormat.POSITION_ONLY})}),modelMatrix:matrix,asynchronous:false,allowPicking:false,appearance:new C.Appearance({material:new C.Material({fabric:{type:'SkywardCloudVolume',uniforms:{...morphology,cloudKind:cloudFormationIndex(o.formation??'cumulus'),cloudSeed:Math.abs(Math.sin(o.seed)*43758.5453)%1,cloudNight:Number(o.night),cloudDarkness:o.storm?1:o.wet?.45:0,cloudOpacity:0,cloudSteps:o.distant?6:o.low?10:16},source:'vec3 cloudCenterA(){return centerA;} vec3 cloudCenterB(){return centerB;} vec3 cloudCenterC(){return centerC;} vec3 cloudCenterD(){return centerD;} vec3 cloudRadiusA(){return radiusA;} vec3 cloudRadiusB(){return radiusB;} vec3 cloudRadiusC(){return radiusC;} vec3 cloudRadiusD(){return radiusD;} float cloudShape(){return cloudKind;} float cloudSamples(){return cloudSteps;} float cloudVisibility(){return cloudOpacity;} vec3 cloudParameters(){return vec3(cloudSeed,cloudNight,cloudDarkness);} czm_material czm_getMaterial(czm_materialInput i){return czm_getDefaultMaterial(i);}'},translucent:true}),vertexShaderSource:vertex,fragmentShaderSource:cloudVolumeFragment(o.distant?6:o.low?10:16),translucent:true,closed:false,renderState:{depthTest:{enabled:true},depthMask:false,cull:{enabled:true,face:C.CullFace.FRONT}}})}));
}

import type * as Cesium from 'cesium';
function splitPosition(C:typeof Cesium,p:Cesium.Cartesian3){const high=new C.Cartesian3(Math.trunc(p.x/65536)*65536,Math.trunc(p.y/65536)*65536,Math.trunc(p.z/65536)*65536);return {high,low:C.Cartesian3.subtract(p,high,new C.Cartesian3())};}
/** Procedural facade detail on mapped extrusions, not a surveyed building model.
 * Coordinates are relative to a nearby anchor to avoid Earth-scale float jitter. */
export function buildingAppearance(C:typeof Cesium,lon:number,lat:number){
 const anchor=C.Cartesian3.fromDegrees(lon,lat),encoded=splitPosition(C,anchor);
 const frame=C.Transforms.eastNorthUpToFixedFrame(anchor);
 const axis=(i:number)=>new C.Cartesian3(frame[i*4],frame[i*4+1],frame[i*4+2]);
 const appearance=new C.PerInstanceColorAppearance({closed:true,translucent:false,flat:false,vertexShaderSource:`
 in vec3 position3DHigh;in vec3 position3DLow;in vec3 normal;in vec4 color;in float batchId;
 out vec3 v_positionEC;out vec3 v_normalEC;out vec4 v_color;
 void main(){
  vec4 p=czm_computePosition();v_positionEC=(czm_modelViewRelativeToEye*p).xyz;v_normalEC=czm_normal*normal;v_color=color;
  gl_Position=czm_modelViewProjectionRelativeToEye*p;
 }`,fragmentShaderSource:`
 in vec3 v_positionEC;in vec3 v_normalEC;in vec4 v_color;
 void main(){
  float dissolve=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
  if(dissolve>buildingVisibility())discard;
  vec3 v_facade=buildingCoordinates(v_positionEC),v_wall=buildingNormal(v_normalEC),v_upEC=buildingUp();
  vec3 normal=normalize(v_normalEC);float wall=1.0-smoothstep(.35,.7,abs(v_wall.z));
  vec2 uv=vec2(abs(v_wall.x)>abs(v_wall.y)?v_facade.y:v_facade.x,v_facade.z)/vec2(3.2,3.8);
  vec2 cell=fract(uv),edge=max(fwidth(uv),vec2(.015));
  float pane=smoothstep(.12,.12+edge.x,cell.x)*(1.0-smoothstep(.88-edge.x,.88,cell.x))*smoothstep(.22,.22+edge.y,cell.y)*(1.0-smoothstep(.8-edge.y,.8,cell.y));
  float detail=1.0-smoothstep(2500.0,9000.0,length(v_positionEC));pane*=wall*detail;
  float night=1.0-smoothstep(-.12,.08,dot(normalize(v_upEC),czm_sunDirectionEC));
  float occupied=step(.65,fract(sin(dot(floor(uv),vec2(12.9898,78.233)))*43758.5453));
  czm_materialInput inputMaterial;inputMaterial.normalEC=normal;inputMaterial.positionToEyeEC=-v_positionEC;
  czm_material material=czm_getDefaultMaterial(inputMaterial);
  material.diffuse=mix(czm_gammaCorrect(v_color).rgb,vec3(.12,.2,.25),pane*.8);
  material.diffuse*=mix(.16,1.0,1.0-night);
  material.specular=pane*.25;material.shininess=24.0;
  material.emission=vec3(.72,.49,.24)*pane*occupied*night*.45;material.alpha=1.0;
  out_FragColor=czm_phong(normalize(-v_positionEC),material,czm_lightDirectionEC);
 }`});
 appearance.material=new C.Material({fabric:{type:'SkywardBuildingFade',uniforms:{visibility:1,anchorHigh:encoded.high,anchorLow:encoded.low,east:axis(0),north:axis(1),up:axis(2)},source:`
 float buildingVisibility(){return visibility;}
 vec3 buildingCoordinates(vec3 positionEC){
  vec3 local=(czm_encodedCameraPositionMCHigh-anchorHigh)+(czm_encodedCameraPositionMCLow-anchorLow)+czm_inverseViewRotation*positionEC;
  return vec3(dot(local,east),dot(local,north),dot(local,up));
 }
 vec3 buildingNormal(vec3 normalEC){vec3 n=czm_inverseViewRotation*normalEC;return vec3(dot(n,east),dot(n,north),dot(n,up));}
 vec3 buildingUp(){return czm_viewRotation*up;}
 czm_material czm_getMaterial(czm_materialInput i){return czm_getDefaultMaterial(i);}`},translucent:false});
 return appearance;
}

const registered=new WeakSet<object>();
/** The same facade treatment for terrain-clamped entity polygons. */
export function buildingMaterial(C:typeof Cesium,lon:number,lat:number,color:Cesium.Color):Cesium.MaterialProperty {
 const anchor=C.Cartesian3.fromDegrees(lon,lat),encoded=splitPosition(C,anchor),frame=C.Transforms.eastNorthUpToFixedFrame(anchor);
 const values={facadeColor:color,anchorHigh:encoded.high,anchorLow:encoded.low,east:new C.Cartesian3(frame[0],frame[1],frame[2]),north:new C.Cartesian3(frame[4],frame[5],frame[6]),up:new C.Cartesian3(frame[8],frame[9],frame[10])};
 if(!registered.has(C)){
  // Constructing a Fabric material registers its template through the public API.
  const template=new C.Material({fabric:{type:'SkywardBuildingFacade',uniforms:values,source:`
   czm_material czm_getMaterial(czm_materialInput i){
    vec3 relative=(czm_encodedCameraPositionMCHigh-anchorHigh)+(czm_encodedCameraPositionMCLow-anchorLow)-czm_inverseViewRotation*i.positionToEyeEC;
    vec3 n=czm_inverseViewRotation*normalize(i.normalEC);
    vec2 uv=vec2(abs(dot(n,east))>abs(dot(n,north))?dot(relative,north):dot(relative,east),dot(relative,up))/vec2(3.2,3.8);
    vec2 cell=fract(uv),edge=max(fwidth(uv),vec2(.015));
    float pane=smoothstep(.12,.12+edge.x,cell.x)*(1.0-smoothstep(.88-edge.x,.88,cell.x))*smoothstep(.22,.22+edge.y,cell.y)*(1.0-smoothstep(.8-edge.y,.8,cell.y));
    pane*=(1.0-smoothstep(.35,.7,abs(dot(n,up))))*(1.0-smoothstep(2500.0,9000.0,length(i.positionToEyeEC)));
    float night=1.0-smoothstep(-.12,.08,dot(czm_viewRotation*up,czm_sunDirectionEC));
    float occupied=step(.65,fract(sin(dot(floor(uv),vec2(12.9898,78.233)))*43758.5453));
    czm_material m=czm_getDefaultMaterial(i);m.diffuse=mix(czm_gammaCorrect(facadeColor).rgb,vec3(.12,.2,.25),pane*.8);
    m.diffuse*=mix(.16,1.0,1.0-night);m.specular=pane*.25;m.shininess=24.0;m.emission=vec3(.72,.49,.24)*pane*occupied*night*.45;m.alpha=facadeColor.a;return m;
   }`},translucent:false});template.destroy();registered.add(C);
 }
 const property:Cesium.MaterialProperty={isConstant:true,definitionChanged:new C.Event(),getType:()=> 'SkywardBuildingFacade',getValue:(_time,result)=>Object.assign(result??{},values),equals:other=>other===property};
 return property;
}

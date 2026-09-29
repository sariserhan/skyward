export function waterMotion(quality:string,reduced:boolean,paused:boolean){return {interval:quality==='low'?100:50,animated:!reduced&&!paused};}
// World-space waves keep water patterns anchored across tile edges and camera moves.
export const WATER_SHADER=`
czm_material czm_getMaterial(czm_materialInput materialInput){
 czm_material m=czm_getDefaultMaterial(materialInput);
 float depth=czm_unpackDepth(texture(czm_globeDepthTexture,gl_FragCoord.xy/czm_viewport.zw));
 vec4 eye=czm_windowToEyeCoordinates(gl_FragCoord.xy,depth);
 vec4 worldH=czm_inverseView*eye;
 vec3 world=worldH.xyz/worldH.w;
 float range=length(eye.xyz/eye.w);
 float detail=1.0-smoothstep(3000.0,18000.0,range);
 float warp=sin(dot(world,vec3(.013,.009,.007)))*1.7;
 float a=dot(world,vec3(.22,.16,.13))+warp+waveTime*.8;
 float b=dot(world,vec3(-.15,.24,.18))-warp*.7-waveTime*.55;
 float c=dot(world,vec3(.31,-.22,.17))+waveTime*1.3;
 float ripple=sin(a)*.5+sin(b)*.3+sin(c)*.2;
 float edge=1.0-smoothstep(radius*.65,radius,distance(world,focusPoint));
 float glint=pow(max(0.0,ripple),5.0)*detail;
 m.diffuse=waterColor.rgb*(.91+ripple*.07*detail)+vec3(.035,.045,.05)*glint;
 m.alpha=opacity*edge;
 vec3 n=normalize(vec3(cos(a)*.12+cos(c)*.06,cos(b)*.12,1.0));
 m.normal=normalize(materialInput.tangentToEyeMatrix*mix(vec3(0.,0.,1.),n,detail*roughness));
 m.specular=.22*detail;m.shininess=55.;m.emission=waterColor.rgb*.025;
 return m;
}`;

export type CloudFormation='cumulus'|'stratus'|'cirrus'|'storm';
/** An illustrative morphology chosen from station cover/base; cloud type itself is not reported. */
export function cloudFormation(layer:{baseM:number;cover:string},storm:boolean,wet=false):CloudFormation{
 if(storm)return 'storm';
 if(!wet&&layer.baseM>=6500&&['FEW','SCT'].includes(layer.cover))return 'cirrus';
 if(layer.baseM<4500&&['BKN','OVC','VV'].includes(layer.cover))return 'stratus';
 return 'cumulus';
}
export const cloudFormationIndex=(kind:CloudFormation)=>({cumulus:0,stratus:1,cirrus:2,storm:3}[kind]);
export function formationThickness(kind:CloudFormation,base:number){return kind==='cirrus'?Math.min(280,base*.4):kind==='stratus'?base*.7:kind==='cumulus'?base*1.8:base;}

export function cloudWidth(size:number,kind:CloudFormation,distant=false){return !distant&&kind==='cumulus'?Math.min(3200,size):size;}
export interface CloudLobe {center:[number,number,number];radius:[number,number,number];}
const morphologyCache=new Map<string,CloudLobe[]>();
/** Stable per-cell morphology, shared by visible density and cabin immersion.
 * Independent lobes form asymmetric banks; no circular layer envelope. */
export function cloudLobes(kind:CloudFormation,seed:number):CloudLobe[]{
 const key=`${kind}:${seed}`,cached=morphologyCache.get(key);if(cached)return cached;
 const hash=(n:number)=>{const x=Math.sin(seed*1.37+n*127.1)*43758.5453;return x-Math.floor(x);};
 const angle=hash(1)*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
 const lobes:CloudLobe[]=Array.from({length:4},(_,i)=>{
  const theta=i*Math.PI*.5+(hash(i*11+2)-.5)*.9;
  const spread=.25+hash(i*11+3)*.24,x=Math.cos(theta)*spread,y=Math.sin(theta)*spread;
  const z=kind==='stratus'?-.08+hash(i*11+4)*.32:kind==='cirrus'?(hash(i*11+4)-.5)*.12:-.23+hash(i*11+4)*.48;
  const cx=x*c-y*s,cy=x*s+y*c;
  return {center:[cx,cy,z],radius:[Math.min(.94-Math.abs(cx),.38+hash(i*11+5)*.27),Math.min(.94-Math.abs(cy),.36+hash(i*11+6)*.28),Math.min(.94-Math.abs(z),kind==='cirrus'?.2:kind==='stratus'?.38+hash(i*11+7)*.23:.53+hash(i*11+7)*.26)]};
 });
 morphologyCache.set(key,lobes);if(morphologyCache.size>256)morphologyCache.delete(morphologyCache.keys().next().value!);return lobes;
}
/** Conservative interior approximation; fine edge erosion remains visual only. */
export function cloudInterior(east:number,north:number,height:number,size:number,thickness:number,kind:CloudFormation,seed:number){
 const x=east/(size*.65),y=north/(size*.55),z=height/(thickness*.55);
 if(![x,y,z].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>=1)return 0;
 const smooth=(a:number,b:number,n:number)=>{const t=Math.max(0,Math.min(1,(n-a)/(b-a)));return t*t*(3-2*t);};
 const lobes=cloudLobes(kind,seed);
 const shape=Math.max(...lobes.map(({center:[a,b,c],radius:[rx,ry,rz]})=>1-((x-a)/rx)**2-((y-b)/ry)**2-((z-c)/rz)**2),kind==='storm'?1-((x-.08)/.88)**2-(y/.78)**2-((z-.5)/.32)**2:-Infinity);
 return smooth(.2,.65,shape)*smooth(-.96,-.78,z)*(kind==='cirrus'?.12:1);
}

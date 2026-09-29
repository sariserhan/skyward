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
/** Conservative interior approximation for camera haze, in the rendered volume's local frame. */
export function cloudInterior(east:number,north:number,height:number,size:number,thickness:number,kind:CloudFormation,seed:number){
 let x=east/(size*.65),y=north/(size*.55),z=height/(thickness*.55);
 if(![x,y,z].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>=1)return 0;
 const smooth=(a:number,b:number,n:number)=>{const t=Math.max(0,Math.min(1,(n-a)/(b-a)));return t*t*(3-2*t);};
 if(kind==='cirrus')return (1-smooth(.55,1,x*x+y*y))*(1-smooth(.25,.95,Math.abs(z)))*.12;
 if(kind==='stratus')return (1-smooth(.62,1,x*x+y*y))*(1-smooth(.35,.95,Math.abs(z)));
 const variant=Math.abs(Math.sin(seed)*43758.5453)%1;x/=.82+.18*variant;y/=1-.18*variant;z+=(variant-.5)*.14;
 const lobes=[[-.43,-.12,-.20,.55,.57,.58],[.39,.05,-.10,.57,.62,.68],[-.08,.30,.20,.55,.54,.70],[.02,-.39,.05,.48,.54,.62]];
 if(kind==='storm')lobes.push([.08,0,.50,.88,.78,.32]);
 return smooth(.2,.65,Math.max(...lobes.map(([a,b,c,rx,ry,rz])=>1-((x-a)/rx)**2-((y-b)/ry)**2-((z-c)/rz)**2)))*smooth(-.92,-.72,z);
}

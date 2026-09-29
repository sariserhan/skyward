/** Illustrative storm strikes, anchored geographically rather than to the screen. */
export interface BoltPoint {lat:number;lon:number;altitude:number;}
export interface LightningStrike {origin:BoltPoint;paths:BoltPoint[][];start:number;duration:number;}
export function lightningIntensity(age:number){
 if(age<0||age>850)return 0;
 // A leader, a bright return stroke and one weaker restrike, then a soft decay.
 return Math.min(1,.15*Math.exp(-(((age-65)/35)**2))+Math.exp(-(((age-180)/80)**2))+.5*Math.exp(-(((age-440)/100)**2)));
}
export function makeLightning(origin:BoltPoint,ground:number,seed:number,start:number,inCloud=false):LightningStrike {
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const cos=Math.max(.15,Math.cos(origin.lat*Math.PI/180));
 const point=(x:number,y:number,z:number):BoltPoint=>({lat:origin.lat+y/111320,lon:((origin.lon+x/(111320*cos)+540)%360)-180,altitude:z});
 const height=Math.max(500,origin.altitude-ground),span=inCloud?2500+random()*3500:height*.3,heading=random()*Math.PI*2;
 const offsets:{x:number;y:number;z:number}[]=[],main:BoltPoint[]=[];let x=0,y=0;
 for(let i=0;i<=28;i++){const t=i/28;x+=(random()-.5)*span*.16;y+=(random()-.5)*span*.16;const q={x:x+(inCloud?Math.cos(heading)*span*t:0),y:y+(inCloud?Math.sin(heading)*span*t:0),z:inCloud?origin.altitude+Math.sin(t*5)*180:origin.altitude-height*t};offsets.push(q);main.push(point(q.x,q.y,q.z));}
 const paths=[main];for(let i=5;i<25;i+=4){const a=offsets[i],branch=[main[i]],direction=heading+(random()-.5)*5,length=height*(.13+random()*.2);for(let j=1;j<=7;j++){const t=j/7;branch.push(point(a.x+Math.cos(direction)*length*t+(random()-.5)*100,a.y+Math.sin(direction)*length*t+(random()-.5)*100,Math.max(ground,a.z-length*t*.7)));}paths.push(branch);}
 return {origin,paths,start,duration:850};
}

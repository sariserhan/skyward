export function modelBudget(quality:'low'|'balanced'|'high',tower=false){return quality==='low'?(tower?3:0):quality==='high'?8:3;}
export function modelRange(selected:boolean,tower=false){return tower?20000:selected?6000:2000;}
export function modelOpacity(distance:number,selected:boolean,tower=false){const end=modelRange(selected,tower),start=end*.7;return Math.max(0,Math.min(1,(end-distance)/(end-start)));}

/** Retain already-loaded nearby models through a small distance band to avoid churn. */
export function nearbyModelIds(rows:{id:string;distance:number;loaded:boolean;visible:boolean}[],budget:number,tower=false){return rows.filter(a=>a.visible&&a.distance<(tower?(a.loaded?20000:18000):(a.loaded?2300:1800))).sort((a,b)=>(a.distance-(a.loaded?250:0))-(b.distance-(b.loaded?250:0))).slice(0,budget).map(a=>a.id);}

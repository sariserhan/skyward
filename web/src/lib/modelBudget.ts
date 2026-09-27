export function modelBudget(quality:'low'|'balanced'|'high'){return quality==='low'?0:quality==='high'?8:3;}
export function modelRange(selected:boolean){return selected?6000:2000;}
export function modelOpacity(distance:number,selected:boolean){const end=modelRange(selected),start=end*.7;return Math.max(0,Math.min(1,(end-distance)/(end-start)));}

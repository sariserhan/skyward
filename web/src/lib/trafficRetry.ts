/** Respect provider cooldowns; repeated outages reduce, rather than increase, traffic. */
export function providerRetryAt(value:string|number|null|undefined,now:number,status:number){
 const seconds=value===null||value===undefined?NaN:Number(value);
 const date=typeof value==='string'&&!Number.isFinite(seconds)?Date.parse(value):NaN;
 return Number.isFinite(seconds)&&seconds>0?now+seconds*1000:Number.isFinite(date)&&date>now?date:status===429?now+60000:0;
}
export function nextTrafficAttempt(failures:number,now:number,providerCooldown=0){return Math.max(providerCooldown,now+Math.min(180000,35000*2**Math.max(0,Math.min(4,failures))));}

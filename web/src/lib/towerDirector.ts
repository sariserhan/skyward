export type DirectorState={target:string;since:number;kind?:string;completed:string[]};
export function directTower(previous:DirectorState, candidates:{hex:string;kind:string}[], now:number, finished:boolean, protectedApproach=false):DirectorState{
 if(previous.target&&!finished&&(protectedApproach||now-previous.since<180000))return previous;
 const completed=previous.target?[...previous.completed,previous.target].slice(-20):previous.completed;
 const next=candidates.find(c=>c.kind==='arrival'&&!completed.includes(c.hex))??candidates.find(c=>c.kind==='departure'&&!completed.includes(c.hex));
 if(!next)return {target:'',since:now,completed};
 return {target:next.hex,since:now,kind:next.kind,completed};
}

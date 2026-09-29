/** Bounded session-only diagnostics. No account data or request URLs. */
export type QualityArea='terrain'|'airport'|'model'|'arrival'|'render';
export type QualityEvent={at:number;area:QualityArea;state:'loading'|'ready'|'failed'|'warning';detail:string};
const events:QualityEvent[]=[];
export function qualityEvent(area:QualityArea,state:QualityEvent['state'],detail:string){events.push({at:Date.now(),area,state,detail:detail.slice(0,100)});if(events.length>60)events.shift();}
export function qualityEvents(){return events.map(e=>({...e}));}

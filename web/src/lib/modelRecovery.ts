export interface ModelAttempt {source:string;fallback:string;stage:'primary'|'fallback'|'marker';since:number;retry:number;ready:boolean;}
export const MODEL_WAIT_MS=15000;
export function modelUri(a:ModelAttempt){const uri=a.stage==='fallback'?a.fallback:a.source;return a.retry?`${uri}${uri.includes('?')?'&':'?'}retry=${a.retry}`:uri;}
export function failedModel(a:ModelAttempt,now:number):ModelAttempt{return {...a,stage:a.stage==='primary'&&a.source!==a.fallback?'fallback':'marker',since:now,ready:false};}
export function modelTimedOut(a:ModelAttempt,now:number){return a.stage!=='marker'&&!a.ready&&now-a.since>=MODEL_WAIT_MS;}

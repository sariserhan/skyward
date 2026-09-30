/** Compact account data only. Binary assets and full replays stay outside SQL. */
export const ACCOUNT_LIBRARY_BYTES=512*1024;
export const ACCOUNT_LIBRARY_LIMITS={
 boardingpasses:{count:50,bytes:1024,free:true},watchlist:{count:30,bytes:1024,free:true},views:{count:10,bytes:16*1024},
 recordings:{count:0,bytes:0,localOnly:true},logbook:{count:100,bytes:2048},
 simulator:{count:5,bytes:4096,summaryOnly:true},trips:{count:20,bytes:8192},
 journal:{count:50,bytes:4096},airports:{count:12,bytes:16*1024},
 missions:{count:20,bytes:4096,summaryOnly:true}
};
/** Extract only summary fields; never send simulation snapshots or ledgers. */
export function careerProgress(value:unknown){
 const v=value as {kind?:string;career?:Record<string,unknown>;[key:string]:unknown};
 const c=v?.kind==='career'?v.career:v?.kind==='career-progress'?v:undefined;
 if(!c||!Number.isSafeInteger(c.day)||(c.day as number)<1||!Number.isSafeInteger(c.cash_cents))throw Error('Choose a valid airport career backup.');
 const text=(key:string,n=100)=>typeof c[key]==='string'?(c[key] as string).slice(0,n):'';
 return {kind:'career-progress',version:1,career_id:text('career_id'),airport_name:text('airport_name'),day:c.day as number,cash_cents:c.cash_cents as number,phase:text('phase',24),mode:text('mode',24),difficulty:text('difficulty',24)};
}

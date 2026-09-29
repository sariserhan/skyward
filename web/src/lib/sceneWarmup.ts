/** Warm local model files and their dependencies without loading extra tracking data. */
export function createModelWarmup(base:string){
 const seen=new Set<string>(),queue:string[]=[];const abort=new AbortController();let active=0,disposed=false;
 async function warm(uri:string){
  const url=new URL(uri,base);if(url.origin!==location.origin)return;
  const response=await fetch(url,{signal:abort.signal,cache:'force-cache'});if(!response.ok)return;
  const model=await response.json();
  const urls=[...(model.buffers??[]),...(model.images??[])].map(x=>x.uri).filter((x:unknown):x is string=>typeof x==='string'&&!x.startsWith('data:')).slice(0,12);
  // Sequential dependencies leave bandwidth available for the visible scene.
  for(const path of urls){const asset=new URL(path,url);if(asset.origin!==location.origin)continue;const r=await fetch(asset,{signal:abort.signal,cache:'force-cache'});if(r.ok)await r.arrayBuffer();}
 }
 function pump(){if(disposed||active||!queue.length)return;active++;void warm(queue.shift()!).catch(()=>{}).finally(()=>{active--;pump();});}
 return {add(uri:string){if(disposed||seen.has(uri)||seen.size>=24)return;seen.add(uri);queue.push(uri);pump();},dispose(){disposed=true;queue.length=0;abort.abort();}};
}

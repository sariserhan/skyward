/** Bounded, low-concurrency cache warming; selection takes priority over traffic. */
export function createModelWarmup(base:string){
 const completed=new Set<string>(),queued=new Set<string>(),queue:string[]=[],failed=new Map<string,number>();
 const abort=new AbortController();let active:string|null=null,disposed=false;
 async function warm(uri:string){
  const url=new URL(uri,base);if(url.origin!==location.origin)return;
  const options={signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]),cache:'force-cache' as const};
  const response=await fetch(url,options);if(!response.ok)throw Error('Model unavailable');
  if(url.pathname.endsWith('.glb')){await response.arrayBuffer();return;}
  const model=await response.json();
  const urls=[...(model.buffers??[]),...(model.images??[])].map(x=>x.uri).filter((x:unknown):x is string=>typeof x==='string'&&!x.startsWith('data:')).slice(0,12);
  for(const path of urls){const asset=new URL(path,url);if(asset.origin!==location.origin)continue;const r=await fetch(asset,options);if(!r.ok)throw Error('Dependency unavailable');await r.arrayBuffer();}
 }
 function pump(){if(disposed||active||!queue.length)return;const uri=queue.shift()!;queued.delete(uri);active=uri;
  void warm(uri).then(()=>{completed.add(uri);if(completed.size>24)completed.delete(completed.values().next().value!);failed.delete(uri);}).catch(()=>{failed.set(uri,Date.now()+30000);if(failed.size>24)failed.delete(failed.keys().next().value!);}).finally(()=>{active=null;pump();});
 }
 return {add(uri:string,priority=false){
  if(disposed||active===uri)return;
  if(completed.has(uri)){completed.delete(uri);completed.add(uri);return;}
  if((failed.get(uri)??0)>Date.now())return;
  if(queued.has(uri)){if(priority){queue.splice(queue.indexOf(uri),1);queue.unshift(uri);}return;}
  if(queue.length>=8){if(!priority)return;queued.delete(queue.pop()!);}
  queued.add(uri);if(priority)queue.unshift(uri);else queue.push(uri);pump();
 },dispose(){disposed=true;queue.length=0;queued.clear();abort.abort();}};
}

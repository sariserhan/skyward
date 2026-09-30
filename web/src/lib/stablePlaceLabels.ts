import type {City} from './cities.ts';
const key=(c:City)=>`${c.name.toLowerCase()}:${c.lon.toFixed(1)}:${c.lat.toFixed(1)}`;
/** Keep a bounded tail of places while adjacent tiles load; preserve existing anchors. */
export function retainPlaceLabels(previous:City[],incoming:City[],limit=600){
 const old=new Map(previous.map(c=>[key(c),c])),result=new Map<string,City>();
 for(const c of [...incoming,...previous]){const id=key(c);if(!result.has(id))result.set(id,old.get(id)??c);if(result.size>=limit)break;}
 return [...result.values()];
}
/** Hide obstructions immediately, but do not flash labels for a single eligible frame. */
export class PlaceLabelVisibility {
 private since:number|null=null;private shown=false;
 update(eligible:boolean,now:number){
  if(!eligible){this.since=null;this.shown=false;return false;}
  this.since??=now;
  if(now-this.since>=350)this.shown=true;
  return this.shown;
 }
}

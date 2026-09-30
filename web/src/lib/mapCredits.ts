import type * as Cesium from 'cesium';
const active=new WeakMap<Cesium.Viewer,Map<string,{credit:Cesium.Credit;count:number}>>();
export const osmCredit='<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>';
/** Reference counts keep one visible attribution when multiple layers use OSM. */
export function retainMapCredit(C:typeof Cesium,v:Cesium.Viewer,html:string){
 let entries=active.get(v);if(!entries){entries=new Map();active.set(v,entries);}
 let entry=entries.get(html);if(!entry){entry={credit:new C.Credit(html,true),count:0};entries.set(html,entry);v.creditDisplay.addStaticCredit(entry.credit);}
 entry.count++;v.scene.requestRender();let released=false;
 return()=>{if(released)return;released=true;if(--entry.count===0){entries.delete(html);if(!v.isDestroyed()){v.creditDisplay.removeStaticCredit(entry.credit);v.scene.requestRender();}}};
}

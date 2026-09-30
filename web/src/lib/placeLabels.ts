import type {City} from './cities.ts';
import type {CityTile} from './cityBuildings.ts';
/** OpenMapTiles place points; tile-buffer copies are excluded before labeling. */
export function tilePlace(properties:Record<string,unknown>,point:{x:number;y:number}|undefined,extent:number,tile:CityTile):City|null{
 const kind=String(properties.class),name=String(properties['name:en']??properties.name_en??properties.name??'').trim();
 if(!['city','town','village','hamlet'].includes(kind)||!name||!point||!Number.isFinite(point.x+point.y+extent)||extent<=0||point.x<0||point.y<0||point.x>=extent||point.y>=extent)return null;
 const x=(tile.x+point.x/extent)/2**tile.z,y=(tile.y+point.y/extent)/2**tile.z;
 return {name:name.slice(0,100),country:'',lon:x*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI,rank:kind==='city'?6:kind==='town'?8:10,population:0,capital:false};
}

import type {City} from './cities.ts';
import type {CityTile} from './cityBuildings.ts';
/** OpenMapTiles place points; tile-buffer copies are excluded before labeling. */
export function tilePlace(properties:Record<string,unknown>,point:{x:number;y:number}|undefined,extent:number,tile:CityTile):City|null{
 const kind=String(properties.class),name=String(properties['name:en']??properties.name_en??properties.name??'').trim();
 if(!['city','town','village','hamlet'].includes(kind)||!name||!point||!Number.isFinite(point.x+point.y+extent)||extent<=0||point.x<0||point.y<0||point.x>=extent||point.y>=extent)return null;
 const x=(tile.x+point.x/extent)/2**tile.z,y=(tile.y+point.y/extent)/2**tile.z;
 return {name:name.slice(0,100),country:'',lon:x*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI,rank:kind==='city'?6:kind==='town'?8:10,population:0,capital:false};
}
export interface NearbyFeature {name:string;kind:'Mountain'|'Water'|'Landmark';lon:number;lat:number;}
export function tileFeature(properties:Record<string,unknown>,point:{x:number;y:number}|undefined,extent:number,tile:CityTile,layer:string):NearbyFeature|null{
 if(!['mountain_peak','water_name','poi'].includes(layer))return null;
 const p=tilePlace({...properties,class:'city'},point,extent,tile);return p?{name:p.name,lon:p.lon,lat:p.lat,kind:layer==='mountain_peak'?'Mountain':layer==='water_name'?'Water':'Landmark'}:null;
}

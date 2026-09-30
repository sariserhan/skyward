import {tilePlace,tileFeature} from '../lib/placeLabels';
import {VectorTile,classifyRings} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import {cityHeight,clipCityRing,type CityTile,type CityBuilding} from '../lib/cityBuildings';
let template:Promise<string>|undefined;
async function tileTemplate(){
 if(!template)template=(async()=>{const r=await fetch('https://tiles.openfreemap.org/planet',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('City map unavailable');const data=await r.json(),url=data.tiles?.[0];if(typeof url!=='string'||!url.startsWith('https://tiles.openfreemap.org/'))throw Error('Invalid city map');return url;})().catch(e=>{template=undefined;throw e;});
 return template;
}
self.onmessage=async(event:MessageEvent<{tile:CityTile;limit:number;water?:boolean;places?:boolean}>)=>{
 const {tile,limit,water,places}=event.data;
 try{
  const url=(await tileTemplate()).replace('{z}',String(tile.z)).replace('{x}',String(tile.x)).replace('{y}',String(tile.y));
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('City tile unavailable');
  const buffer=await response.arrayBuffer();if(buffer.byteLength>8*1024*1024)throw Error('City tile too large');
  if(places){
   const vector=new VectorTile(new PbfReader(buffer)),layer=vector.layers.place,rows=[];
   if(layer)for(let i=0;i<Math.min(layer.length,5000);i++){const f=layer.feature(i);if(f.type!==1)continue;const place=tilePlace(f.properties,f.loadGeometry()[0]?.[0],f.extent,tile);if(place)rows.push(place);if(rows.length>=limit)break;}
   const features=[];
   for(const name of ['mountain_peak','water_name','poi']){const source=vector.layers[name];if(!source)continue;for(let i=0;i<Math.min(source.length,2000)&&features.length<150;i++){const f=source.feature(i);if(f.type!==1&&!(name==='water_name'&&f.type===2))continue;const line=f.loadGeometry()[0],point=line?.[Math.floor(line.length/2)];const feature=tileFeature(f.properties,point,f.extent,tile,name);if(feature)features.push(feature);}}
   self.postMessage({key:tile.key,places:rows,features});return;
  }
  const layer=new VectorTile(new PbfReader(buffer)).layers[water?'water':'building'],buildings:(CityBuilding&{kind?:string})[]=[];
  if(layer){
   const features=Array.from({length:Math.min(layer.length,30000)},(_,i)=>layer.feature(i)).filter(f=>f.type===3&&f.properties.class!=='ice'&&f.properties.hide_3d!==true&&f.properties.hide_3d!==1&&f.properties.hide_3d!=='true').sort((a,b)=>cityHeight(b.properties).height-cityHeight(a.properties).height);
   let vertices=0;
   for(const feature of features){
    if(buildings.length>=limit||vertices>100000)break;
    const h=water?{base:0,height:1}:cityHeight(feature.properties);if(h.base>=h.height)continue;
    // classifyRings only needs x/y, despite the Point class annotation.
    const rings=feature.loadGeometry().map(r=>clipCityRing(r,feature.extent)).filter(r=>r.length>=3&&Math.abs(r.reduce((sum,p,i)=>{const next=r[(i+1)%r.length];return sum+p.x*next.y-next.x*p.y;},0))>.1);
    const polygons=classifyRings(rings as Parameters<typeof classifyRings>[0]);
    for(const polygon of polygons){
     if(!polygon.length)continue;
     if(buildings.length>=limit)break;
     const converted=polygon.map(r=>r.map(p=>{const x=(tile.x+p.x/feature.extent)/2**tile.z,y=(tile.y+p.y/feature.extent)/2**tile.z;return [x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];}));
     const count=converted.reduce((n,r)=>n+r.length,0);if(count>(water?20000:4000))continue;vertices+=count;buildings.push({rings:converted,...h,...(water?{kind:String(feature.properties.class??'lake')}: {})});
    }
   }
  }
  self.postMessage({key:tile.key,buildings});
 }catch{self.postMessage({key:tile.key,error:true});}
};

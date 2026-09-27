import type * as Cesium from 'cesium';
export interface AtlasShape {rings:number[][][];bounds:number[];shade?:number;rank?:number;}
export interface AtlasData {land:AtlasShape[];lakes:AtlasShape[];rivers:AtlasShape[];labels:{name:string;lon:number;lat:number;rank:number}[];}
export const ATLAS_COLORS={ocean:'#10283b',land:['#314d50','#365557','#3a5651','#304e55'],border:'#72918c',lake:'#173b53',river:'#426d83'};
export function overlaps(a:number[],b:number[]){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function createAtlasProvider(data:AtlasData){
 const C=window.Cesium,scheme=new C.GeographicTilingScheme();
 const credit=new C.Credit('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Atlas: Natural Earth · regional reference map</a>',true);
 const cache=new Map<string,HTMLCanvasElement>();
 const provider:Cesium.ImageryProvider={
  tileWidth:256,tileHeight:256,minimumLevel:0,maximumLevel:10,tilingScheme:scheme,rectangle:scheme.rectangle,credit,errorEvent:new C.Event(),hasAlphaChannel:false,tileDiscardPolicy:new C.NeverTileDiscardPolicy(),proxy:undefined as unknown as Cesium.Proxy,
  getTileCredits:()=>[credit],pickFeatures:()=>undefined,
  requestImage:(x,y,level)=>{
   const key=`${level}/${x}/${y}`;const cached=cache.get(key);if(cached)return Promise.resolve(cached);
   const rect=scheme.tileXYToRectangle(x,y,level,new C.Rectangle());const west=C.Math.toDegrees(rect.west),east=C.Math.toDegrees(rect.east),south=C.Math.toDegrees(rect.south),north=C.Math.toDegrees(rect.north);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)return Promise.reject(new Error('Atlas canvas unavailable'));
   ctx.fillStyle=ATLAS_COLORS.ocean;ctx.fillRect(0,0,256,256);ctx.lineJoin='round';ctx.lineCap='round';
   const dx=east-west,dy=north-south,bounds=[west-dx/128,south-dy/128,east+dx/128,north+dy/128];
   const path=(shape:AtlasShape,closed:boolean)=>{ctx.beginPath();for(const ring of shape.rings){let lastX=Infinity,lastY=Infinity;for(let i=0;i<ring.length;i++){const p=ring[i],px=(p[0]-west)/dx*256,py=(north-p[1])/dy*256;if(i>0&&i<ring.length-1&&Math.abs(px-lastX)+Math.abs(py-lastY)<.65)continue;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);lastX=px;lastY=py;}if(closed)ctx.closePath();}};
   for(const shape of data.land){if(!overlaps(shape.bounds,bounds))continue;path(shape,true);ctx.fillStyle=ATLAS_COLORS.land[shape.shade??0];ctx.fill('evenodd');ctx.strokeStyle=ATLAS_COLORS.border;ctx.lineWidth=level<2?.45:.75;ctx.stroke();}
   for(const shape of data.lakes){if(!overlaps(shape.bounds,bounds))continue;path(shape,true);ctx.fillStyle=ATLAS_COLORS.lake;ctx.fill('evenodd');if(level>=3){ctx.strokeStyle='#527d8e';ctx.lineWidth=.45;ctx.stroke();}}
   if(level>=2)for(const shape of data.rivers){if((shape.rank??4)>(level<4?3:6)||!overlaps(shape.bounds,bounds))continue;path(shape,false);ctx.strokeStyle=ATLAS_COLORS.river;ctx.lineWidth=level<5?.65:1.15;ctx.stroke();}
   cache.set(key,canvas);if(cache.size>64)cache.delete(cache.keys().next().value!);return Promise.resolve(canvas);
  }
 };
 return {provider,dispose:()=>cache.clear()};
}

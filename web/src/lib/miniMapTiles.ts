/** Shared Web Mercator math and a bounded raster cache for the small flight maps. */
export const mercatorY=(lat:number)=>{const radians=Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180;return (1-Math.log(Math.tan(Math.PI/4+radians/2))/Math.PI)/2;};
export function miniMapTiles(lon:number,lat:number,span:number,width=600,height=300){
 const worldPixels=width*360/span,z=Math.max(0,Math.min(17,Math.floor(Math.log2(worldPixels/256)))),n=2**z,size=worldPixels/n;
 const cx=(lon+180)/360*n,cy=mercatorY(lat)*n;
 const tiles=[];
 for(let y=Math.floor(cy-height/2/size);y<=Math.floor(cy+height/2/size);y++)for(let x=Math.floor(cx-width/2/size);x<=Math.floor(cx+width/2/size);x++){
  if(y<0||y>=n)continue;tiles.push({z,x:((x%n)+n)%n,y,left:width/2+(x-cx)*size,top:height/2+(y-cy)*size,size});
 }
 return tiles;
}
type Entry={image:HTMLImageElement|null;promise:Promise<void>;failedAt:number};
const cache=new Map<string,Entry>();let active=0;const queue:(()=>void)[]=[];
function pump(){while(active<6&&queue.length){active++;queue.shift()!();}}
export function mapTile(z:number,x:number,y:number,labels=false){
 const layer=labels?'Reference/World_Boundaries_and_Places':'World_Imagery',url=`https://services.arcgisonline.com/ArcGIS/rest/services/${layer}/MapServer/tile/${z}/${y}/${x}`;
 const old=cache.get(url);if(old&&(!old.failedAt||Date.now()-old.failedAt<60000)){cache.delete(url);cache.set(url,old);return old;}
 if(queue.length>=24)return {image:null,promise:Promise.resolve(),failedAt:Date.now()} as Entry;
 const entry:Entry={image:null,promise:Promise.resolve(),failedAt:0};
 entry.promise=new Promise<void>(resolve=>{queue.push(()=>{const image=new Image();image.crossOrigin='anonymous';let finished=false;const finish=(ok:boolean)=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=null;image.onerror=null;if(ok)entry.image=image;else entry.failedAt=Date.now();active--;resolve();pump();};const timer=setTimeout(()=>{finish(false);image.src='';},12000);image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=url;});});cache.set(url,entry);while(cache.size>128)cache.delete(cache.keys().next().value!);pump();return entry;
}

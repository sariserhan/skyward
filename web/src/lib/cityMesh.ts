import type * as Cesium from 'cesium';
import type {CityBuilding} from './cityBuildings';
import {buildingAppearance} from './buildingAppearance';
/** A full-detail tile admitted in small geometry/upload batches, never all at once. */
export function createCityMesh(C:typeof Cesium,buildings:CityBuilding[],bases:number[],include:(lon:number,lat:number)=>boolean){
 const root=new C.PrimitiveCollection(),appearance=buildingAppearance(C,buildings[0]?.rings[0]?.[0]?.[0]??0,buildings[0]?.rings[0]?.[0]?.[1]??0);
 let index=0,pending:Cesium.Primitive|undefined;
 return {root,appearance,get ready(){return index>=buildings.length&&(!pending||pending.ready);},
  pump(){
   if(pending&&!pending.ready)return false;if(index>=buildings.length)return false;
   const instances:Cesium.GeometryInstance[]=[];let vertices=0,count=0;
   while(index<buildings.length&&count<48&&vertices<2000){
    const i=index++,b=buildings[i],ring=b.rings[0];count++;if(!ring?.length)continue;
    const lon=ring.reduce((s,p)=>s+p[0],0)/ring.length,lat=ring.reduce((s,p)=>s+p[1],0)/ring.length;if(!include(lon,lat))continue;
    vertices+=b.rings.reduce((n,r)=>n+r.length,0);
    const hierarchy=new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(ring.flat()),b.rings.slice(1).map(hole=>new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(hole.flat()))));
    instances.push(new C.GeometryInstance({geometry:new C.PolygonGeometry({polygonHierarchy:hierarchy,height:bases[i]+b.base,extrudedHeight:bases[i]+b.height,vertexFormat:C.PerInstanceColorAppearance.VERTEX_FORMAT}),attributes:{color:C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(b.height>80?'#acb9c0':b.height>25?'#b5b9b7':'#c1bcb0'))}}));
   }
   if(instances.length)pending=root.add(new C.Primitive({geometryInstances:instances,appearance,asynchronous:true,allowPicking:false}));
   return true;
  }
 };
}
export type CityMesh=ReturnType<typeof createCityMesh>;

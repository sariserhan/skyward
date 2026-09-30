import type * as Cesium from 'cesium';
const sources=new WeakMap<Cesium.ModelGraphics,string>();
/** Keep node properties stable while animating; discard old rig nodes on model changes. */
export function aircraftNodeTransforms(model:Cesium.ModelGraphics,uri:string){
 const C=window.Cesium,previous=sources.get(model);
 if(!model.nodeTransformations||(previous!==undefined&&previous!==uri))model.nodeTransformations=new C.PropertyBag();
 sources.set(model,uri);return model.nodeTransformations;
}
export function setAircraftNode(bag:Cesium.PropertyBag,name:string,value:Cesium.TranslationRotationScale){
 const C=window.Cesium;
 if(!bag.hasProperty(name))bag.addProperty(name,new C.ConstantProperty(value));
 else if(bag[name] instanceof C.ConstantProperty)bag[name].setValue(value);
 else bag[name]=new C.ConstantProperty(value);
}

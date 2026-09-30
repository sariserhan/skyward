/** Preserve Cesium graphics/properties so unchanged updates do not churn visualizers. */
export function updateGraphics<T extends object>(graphics:T,values:Record<string,unknown>){
 const fields=graphics as Record<string,unknown>,C=window.Cesium;
 for(const [key,value] of Object.entries(values)){
  const current=fields[key];
  if(value!==undefined&&current instanceof C.ConstantProperty)current.setValue(value);
  else if(current!==undefined||value!==undefined)fields[key]=value;
 }
 return graphics;
}

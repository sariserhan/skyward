const layers=new WeakMap<object,string>();
export function tagRenderLayer(object:object,kind:string){layers.set(object,kind);}
export function renderLayerCounts(collection:{length:number;get:(i:number)=>object}){const counts:Record<string,number>={};for(let i=0;i<Math.min(collection.length,5000);i++){const layer=layers.get(collection.get(i));if(layer)counts[layer]=(counts[layer]??0)+1;}return counts;}

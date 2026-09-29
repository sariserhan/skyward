type Material={name?:string;extensions?:unknown;pbrMetallicRoughness?:{roughnessFactor?:number;metallicFactor?:number;metallicRoughnessTexture?:unknown;[key:string]:unknown};[key:string]:unknown};
/** Refine explicitly named surfaces; never guess glass from dark paint or erase texture maps. */
export function refineAircraftMaterials(model:{materials?:Material[]}){
 let changed=0;
 for(const m of model.materials??[]){
  const p=m.pbrMetallicRoughness;if(!p||p.metallicRoughnessTexture||m.extensions)continue;
  const name=(m.name??'').toLowerCase();let profile:[number,number]|undefined;
  if(/(?:^|[_ .-])(rubber|tyre|tire)(?:$|[_ .-]|\d)/.test(name))profile=[.92,0];
  else if(/^(glass|windows?)(?:$|[_ .-]|\d)/.test(name))profile=[.14,0];
  else if(/^(chrome|polishedmetal)(?:$|[_ .-]|\d)/.test(name))profile=[.22,.85];
  else if(/^(engineinterior|engine_inside|fanblades?)(?:$|[_ .-]|\d)/.test(name))profile=[.65,.55];
  if(!profile)continue;
  if(p.roughnessFactor===profile[0]&&p.metallicFactor===profile[1])continue;
  p.roughnessFactor=profile[0];p.metallicFactor=profile[1];changed++;
 }
 return changed;
}

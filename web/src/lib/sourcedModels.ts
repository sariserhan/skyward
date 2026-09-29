import catalog from './sourcedAircraft.json' with {type:'json'};
const byType=new Map(catalog.flatMap(model=>model.types.map(type=>[type,model] as const)));
const byId=new Map(catalog.map(model=>[model.id,model]));
// These share an airframe family, not necessarily engine / wing / ER details.
export const familyAliases:Record<string,string>={B37M:'b39m',B38M:'b39m',B77W:'b773',B77L:'b772',B461:'bae146',B462:'bae146',B463:'bae146',A20N:'a320',A21N:'a321',A19N:'a319',A339:'a333',A338:'a332',A35K:'a359',B78X:'b789',E75S:'e175',E175:'e175',E195:'e190',E290:'e190',E295:'e190',CRJX:'crj900',AT72:'atr72',AT76:'atr72',C560:'citation',C56X:'citation',SR20:'sr22',P28A:'pa28',P28B:'pa28',P28R:'pa28',P28T:'pa28',P32R:'pa32',E135:'e145',E35L:'e145',E45X:'e145',B77F:'b772'};
Object.assign(familyAliases,{A342:'a343',A345:'a346',B731:'b737',B732:'b737',B733:'b737',B734:'b737',B735:'b737',B741:'b744',B742:'b744',B743:'b744',B74S:'b744',C500:'citation',C501:'citation',C551:'citation',RJ70:'bae146',RJ85:'bae146',RJ1H:'bae146'});
export function sourcedModel(type:string){const t=type.trim().toUpperCase(),exact=byType.get(t),family=familyAliases[t]?byId.get(familyAliases[t]):undefined;const model=exact??family;return model?{...model,match:exact&&(!('variantVerified' in model)||model.variantVerified!==false)?'type' as const:'family' as const}:null;}
export {catalog as sourcedCatalog};

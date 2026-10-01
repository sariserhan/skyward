import routes from '../../data/special-aircraft-routes.json' with {type:'json'};
const byPath=new Map(routes.map(r=>[r.path,r]));
export function specialFlightRoute(path:string){return byPath.get(path.toLowerCase().replace(/\/?$/,'/'));}
export const specialFlightPaths=()=>routes.map(r=>r.path);

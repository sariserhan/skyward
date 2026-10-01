import {readFile,writeFile} from 'node:fs/promises';
import {planTaxi} from '../src/lib/taxiRoute.ts';
const root=new URL('../',import.meta.url).pathname;
const c=JSON.parse(await readFile(root+'data/airport-catalog.json'));const rows=[];
for(const id of Object.keys(c).sort()){
 const a=JSON.parse(await readFile(root+`public/data/airports/${id}.json`));let total=0,mapped=0;
 for(const r of a.runways){for(const [from,to] of [[r.a,r.b],[r.b,r.a]]){total++;if(planTaxi(a,{lon:from[0],lat:from[1]},{lon:to[0],lat:to[1]}))mapped++;}}
 rows.push({id,total,mapped,paths:a.paths.length,gates:a.gates.length});
 if(rows.length%100===0)console.log(rows.length);
}
await writeFile(process.argv[2]??root+'data/taxi-route-audit.json',JSON.stringify({clearanceMeters:30,scope:'Mapped runway-to-stand connectivity; not live gate assignment or visual certification',airports:rows},null,2));console.log(JSON.stringify({airports:rows.length,any:rows.filter(r=>r.mapped).length,full:rows.filter(r=>r.total&&r.mapped===r.total).length,directions:rows.reduce((s,r)=>s+r.mapped,0)}));

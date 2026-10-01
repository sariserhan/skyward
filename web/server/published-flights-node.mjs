import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {PublishedFlights} from './published-flights.mjs';
export function fileFlightCatalog(path){return new PublishedFlights({
 load:async()=>{try{const rows=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(rows))throw Error('Invalid published flight catalog');return rows;}catch(e){if(e.code==='ENOENT')return [];throw e;}},
 save:async(_record,rows)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(rows));await rename(path+'.tmp',path);}
});}

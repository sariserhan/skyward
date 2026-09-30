// The ground demonstration shares the full procedural 737 rig.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../public/models/fleet/',import.meta.url),g=JSON.parse(await readFile(new URL('b737-neutral-v4.gltf',root),'utf8'));
for(const material of g.materials)material.emissiveFactor=[.055,.06,.065];
g.asset.generator='Skyward illustrative ground rig with independent control surfaces and wheel axles';
await writeFile(new URL('ground-b737.gltf',root),JSON.stringify(g));

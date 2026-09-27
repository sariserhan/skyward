import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/cesium', { recursive: true });
for (const name of ['Cesium.js', 'Assets', 'Workers', 'Widgets', 'ThirdParty']) {
  await cp(`node_modules/cesium/Build/Cesium/${name}`, `public/cesium/${name}`, { recursive: true });
}
for (const name of ['LICENSE.md', 'ThirdParty.json', 'ThirdParty.extra.json']) {
  await cp(`node_modules/cesium/${name}`, `public/cesium/${name}`);
}

import test from 'node:test';import assert from 'node:assert/strict';
import {retainMapCredit,osmCredit} from '../src/lib/mapCredits.ts';
test('shared map attribution stays visible until the last contributing layer releases it',()=>{
 const shown=new Set(),C={Credit:class{constructor(html,onScreen){this.html=html;this.onScreen=onScreen;}}},v={isDestroyed:()=>false,scene:{requestRender(){}},creditDisplay:{addStaticCredit:c=>shown.add(c),removeStaticCredit:c=>shown.delete(c)}};
 const airport=retainMapCredit(C,v,osmCredit),city=retainMapCredit(C,v,osmCredit),tiles=retainMapCredit(C,v,'OpenMapTiles');
 assert.equal(shown.size,2);airport();airport();assert.equal(shown.size,2);assert.ok([...shown].some(c=>c.html===osmCredit&&c.onScreen));city();assert.equal(shown.size,1);tiles();assert.equal(shown.size,0);
});

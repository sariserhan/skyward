import test from 'node:test';
import assert from 'node:assert/strict';
import {positionIssue,qualityRows,coloredTrail,trackSummary} from '../src/lib/positionQuality.ts';
import {parseBackup,makeBackup,restoreBackup} from '../src/lib/localBackup.ts';
const point=(time,lon=0,altitude=10000)=>({time,lon,lat:0,altitude,ground:false});
test('position quality rejects jumps, conflicts, future fixes and unordered data but accepts dateline and reacquisition',()=>{
 const a=point(100000);
 assert.match(positionIssue(a,point(130000,20),200000),/jump/);
 assert.match(positionIssue(a,point(100000,1),200000),/Conflicting/);
 assert.match(positionIssue(a,point(90000),200000),/Out-of-order/);
 assert.match(positionIssue(a,point(210000),200000),/Future/);
 assert.match(positionIssue(a,point(130000,0,30000),200000),/altitude/);
 assert.equal(positionIssue(point(100000,179.99),point(130000,-179.99),200000),null);
 assert.equal(positionIssue(a,point(230001,20),300000),null);
});
test('rejected fix retains accepted identity, position and original timestamp; recovery clears warning',()=>{
 const cache=new Map(),a={hex:'abcdef',lat:0,lon:0,altitude:10000,observedAt:100000};
 qualityRows([a],cache,200000);const rejected=qualityRows([{...a,lon:30,observedAt:130000}],cache,200000)[0];assert.equal(rejected.lon,0);assert.equal(rejected.observedAt,100000);assert.match(rejected.positionWarning,/jump/);assert.equal(qualityRows([rejected],cache,200000)[0].positionWarning,rejected.positionWarning);
 const accepted=qualityRows([{...a,lon:.1,observedAt:160000}],cache,200000)[0];assert.equal(accepted.lon,.1);assert.equal(accepted.positionWarning,undefined);
});
test('colored track and summary exclude quality jumps and coverage gaps',()=>{
 const pts=[point(0,0,9000),point(60000,.1,11000),point(90000,40,12000),point(300000,41,30000),point(330000,41.1,30000)];
 const segments=coloredTrail(pts),s=trackSummary(pts);assert.equal(segments.length,2);assert.equal(segments[0].color,'#8fdfc8');assert.equal(segments[1].color,'#d1a7ff');assert.equal(s.gaps,2);assert.equal(s.observedMs,90000);assert.ok(s.distance>11.9&&s.distance<12.1);assert.equal(s.climb,2000);
});
function storage(initial={}){const map=new Map(Object.entries(initial));return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
test('backup round trip is scoped, rejects malicious schemas and rolls back failed writes',()=>{
 const s=storage({'skyward.map.v1':'{"basemap":"atlas"}','skyward.route-unit':'km','unrelated':'secret'}),b=makeBackup(s);assert.equal(Object.keys(b.values).length,2);const parsed=parseBackup(JSON.stringify(b));const dest=storage({'unrelated':'keep'});restoreBackup(parsed,dest);assert.equal(dest.getItem('skyward.route-unit'),'km');assert.equal(dest.getItem('unrelated'),'keep');
 for(const values of [{'unknown':'x'},{'skyward.map.v1':'{"basemap":"evil"}'},{'skyward.camera-bookmarks.v1':'[{"pose":{"lon":900}}]'},{'skyward.favorites.v1':'null'}])assert.throws(()=>parseBackup(JSON.stringify({...b,values})));
 assert.throws(()=>parseBackup('x'.repeat(1048577)));
 const target=storage({'skyward.map.v1':'{"basemap":"satellite"}','skyward.route-unit':'nm'});let once=true;const original=target.setItem;target.setItem=(k,v)=>{if(k==='skyward.route-unit'&&once){once=false;throw Error('quota');}original(k,v);};assert.throws(()=>restoreBackup(b,target),/previous settings restored/);assert.equal(target.getItem('skyward.map.v1'),'{"basemap":"satellite"}');assert.equal(target.getItem('skyward.route-unit'),'nm');
});

import {validBackupValue,backupKeys} from '../src/lib/localBackup.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {interestingFlight,savedFlight} from '../src/lib/watchDiscovery.ts';
import {destinationAlert} from '../src/lib/destinationAlerts.ts';
import {airportGroundActivity} from '../src/lib/airportTimeline.ts';
import {parseView,observeAlerts} from '../src/lib/experience.ts';
const now=1800000000000,center={lat:38.947,lon:-77.46};
const aircraft={hex:'abcdef',callsign:'TEST1',targetKind:'aircraft',lat:38.947,lon:-77.55,altitude:2200,heading:90,groundSpeed:150,verticalRate:-600,ground:false,observedAt:now};
test('discovery prefers supported approaches, rotates subjects, rejects stale or suspect motion',()=>{
 const points=[-77.65,-77.60,-77.55].map((lon,i)=>({lat:38.947,lon,altitude:2200,ground:false,time:now-(2-i)*30000})),histories=new Map([['abcdef',points]]),other={...aircraft,hex:'123abc',lon:-77.46};
 assert.equal(interestingFlight([other,aircraft],histories,'IAD',center,now).reason,'Approach candidate');
 assert.equal(interestingFlight([other,aircraft],histories,'IAD',center,now,'abcdef').a.hex,'123abc');
 for(const patch of [{ground:true},{altitude:null},{observedAt:now-31000},{positionWarning:'jump'}])assert.equal(interestingFlight([{...aircraft,...patch}],histories,'IAD',center,now),null);
});
test('destination alerts require fresh consecutive descending observations and a matching recent route',()=>{
 const a={...aircraft,lat:0,lon:.49},before={...a,lon:.51,observedAt:now-30000},dest={id:'TEST',lat:0,lon:0,callsign:'TEST1',loadedAt:now};
 assert.match(destinationAlert(before,a,dest,now).title,/inferred.*unconfirmed/);
 assert.equal(destinationAlert(a,a,dest,now),null);
 for(const patch of [{callsign:'OTHER'},{ground:true},{verticalRate:300},{observedAt:now-60000},{observedAt:now+60000},{positionWarning:'jump'}])assert.equal(destinationAlert(before,{...a,...patch},dest,now),null);
 assert.equal(destinationAlert(before,a,{...dest,loadedAt:now-1800001},now),null);
 assert.equal(destinationAlert({...before,observedAt:now-300000},a,dest,now),null);
});
test('ground timeline only lists recent airport ground observations, without inferred gates',()=>{
 const ground={...aircraft,ground:true,lon:center.lon};assert.equal(airportGroundActivity([ground,aircraft,{...ground,hex:'bad',observedAt:now-120001}],center,now).length,1);
 assert.equal(airportGroundActivity([{...ground,lon:10}],center,now).length,0);
 const result=observeAlerts({last:aircraft,gap:false},{...ground,observedAt:now+1000},now+1000);assert.ok(result.events.some(e=>e.title.includes('landing unconfirmed')));
});
test('flight scene links whitelist viewpoints; saved identities reject malformed storage',()=>{
 assert.equal(parseView('#airport=IAD&aircraft=abcdef&scene=flight&view=cockpit').sceneView,'cockpit');
 assert.equal(parseView('#scene=flight&view=javascript:alert(1)').sceneView,null);
 assert.ok(backupKeys.includes('skyward.last-flight.v1'));assert.equal(validBackupValue('skyward.last-flight.v1',JSON.stringify({hex:'abcdef',label:'TEST'})),true);assert.equal(validBackupValue('skyward.last-flight.v1',JSON.stringify({hex:'../../',label:'TEST'})),false);
 assert.equal(savedFlight({hex:'../../',label:'x'}),null);assert.equal(savedFlight(null),null);assert.deepEqual(savedFlight({hex:'ABCDEF',label:'TEST'}),{hex:'abcdef',label:'TEST'});
});

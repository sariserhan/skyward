import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAirframeHistory} from '../src/lib/airframeHistory.ts';
const now=Date.now(),e={sourceUrl:'https://example.org',sourceName:'Test',verifiedAt:'2026-09-30',confidence:'HIGH',validFrom:null,validTo:null},a={id:'example-frame',retired:true,registrations:[{...e,value:'N123AA'}],icaoIdentities:[]},c={aircraft:[a]},row={observedAt:now-10000,hex:'abcdef',registration:'N123AA',lat:39,lon:-77};
const input={version:1,aircraftId:a.id,sourceName:'Fixture',sourceUrl:'https://example.org/archive',license:'ODbL 1.0',observations:[row]};
test('historical imports validate time-valid identity and evidence, keeping retired aircraft history separate',()=>{
 assert.equal(parseAirframeHistory(JSON.stringify(input),c,a,now).observations.length,1);
 for(const change of [{aircraftId:'other-frame'},{sourceUrl:'http://example.org'},{license:''},{observations:Array(201).fill(row)},{observations:[{...row,simulation:{}}]},{observations:[{...row,registration:'N456AA'}]},{observations:[{...row,observedAt:now+1}]},{observations:[{...row,observedAt:now-367*86400000}]}])assert.throws(()=>parseAirframeHistory(JSON.stringify({...input,...change}),c,a,now));
 assert.throws(()=>parseAirframeHistory(' '.repeat(131073),c,a));
 assert.equal(parseAirframeHistory(JSON.stringify({...input,observations:[row,row]}),c,a,now).observations.length,1);
});

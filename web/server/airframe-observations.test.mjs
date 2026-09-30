import test from 'node:test';
import assert from 'node:assert/strict';
import {matchAirframeObservation,readObservation,saveObservation} from '../src/lib/airframeObservations.ts';
import {normalizedFollows} from '../src/lib/airframeCatalog.ts';
import {readAirframeFollows,writeAirframeFollows} from '../src/lib/airframeLibrary.ts';
const now=Date.parse('2026-09-30T12:00:00Z'),e={sourceUrl:'https://example.org/registry',sourceName:'Fixture',verifiedAt:'2026-09-30',confidence:'HIGH',validFrom:null,validTo:null};
const a={id:'frame-one',manufacturer:'Example',model:'Test',category:'Test',sources:[e],registrations:[{...e,value:'N123AA'}],icaoIdentities:[]};
const c={version:1,aircraft:[a],entities:[],associations:[]};
const row={hex:'abcdef',registration:'N123AA',observedAt:now,lat:39,lon:-77,altitude:1000,groundSpeed:120,ground:false};
function storage(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('observations reject invalid positions, future timestamps, synthetic and conflicting identities',()=>{
 assert.equal(matchAirframeObservation(c,a,[row],now).hex,'abcdef');
 for(const extra of [{simulation:{}},{lat:NaN},{lon:181},{lat:null},{observedAt:now+60000},{observedAt:0},{observedAt:now-31*60000},{hex:'not-a-hex'},{registration:'N999AA'}])assert.equal(matchAirframeObservation(c,a,[{...row,...extra}],now),null);
 assert.equal(matchAirframeObservation({...c,aircraft:[a,{...a,id:'other-frame'}]},a,[row],now),null);
 assert.equal(matchAirframeObservation(c,{...a,icaoIdentities:[{...e,value:'123456'}]},[row],now),null);
 assert.equal(matchAirframeObservation(c,a,[row,{...row,hex:'123456'}],now),null);
});
test('duplicate observations choose latest timestamp, strip extra fields, and respect dated identity',()=>{
 const matched=matchAirframeObservation(c,a,[{...row,observedAt:now-1000}, {...row,passenger:'not for persistence'}],now);assert.equal(matched.observedAt,now);assert.equal(matched.passenger,undefined);
 assert.equal(matchAirframeObservation(c,{...a,registrations:[{...e,value:'N123AA',validTo:'2026-09-30'}]},[row],now),null);
});
test('per-tab cache is bounded, expires and revalidates identity without fetching',()=>{
 const s=storage();saveObservation(s,a.id,{row,source:'Fixture',checkedAt:now},now);
 assert.deepEqual(readObservation(s,c,a,now+1000),{row,source:'Fixture',checkedAt:now});
 assert.equal(readObservation(s,c,{...a,retired:true},now+1000).row,null);
 assert.equal(readObservation(s,c,a,now+31*60000).row,null);
 for(let i=0;i<15;i++)saveObservation(s,'frame-'+i,{row,source:'Fixture',checkedAt:now},now);
 assert.equal(Object.keys(JSON.parse([...s.data.values()][0])).length,10);
 const broken={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
 assert.equal(readObservation(broken,c,a,now).row,null);assert.doesNotThrow(()=>saveObservation(broken,a.id,{row,source:'',checkedAt:now},now));
});
test('withdrawn identities remain in local follows and can be explicitly removed',()=>{
 const previousStorage=globalThis.localStorage,previousWindow=globalThis.window,s=storage();globalThis.localStorage=s;globalThis.window={dispatchEvent:()=>{}};
 try{s.setItem('skyward.airframe-follows.v1',JSON.stringify(['frame-one','withdrawn-frame','bad/value']));assert.deepEqual(readAirframeFollows(c),['frame-one','withdrawn-frame']);assert.deepEqual(writeAirframeFollows(c,['frame-one','withdrawn-frame']),['frame-one','withdrawn-frame']);assert.deepEqual(writeAirframeFollows(c,['frame-one']),['frame-one']);assert.throws(()=>normalizedFollows(c,['withdrawn-frame']));}finally{globalThis.localStorage=previousStorage;globalThis.window=previousWindow;}
});

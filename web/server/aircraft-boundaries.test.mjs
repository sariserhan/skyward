import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAircraftContext} from '../src/lib/aircraftContext.ts';
import {airlabsUsageAllowed,airlabsPositionUsageAllowed} from './airlabs-permissions.mjs';
import {createPremiumLive} from './premium-live.mjs';
import {verifiedAirLabs} from './fixtures/airlabs-permissions.mjs';
const context={id:'historical-example',personName:'Example person',aircraftDescription:'Retired museum aircraft',relationship:'HISTORICAL',status:'HISTORICAL',confidence:'HIGH',sourceUrl:'https://example.org/museum',sourceName:'Museum fixture',lastVerifiedAt:'2026-10-01',validFrom:null,validTo:null};
test('context requires evidence and explicit relationship, rejecting operational/contact fields',()=>{
 const wrap=r=>({version:1,associations:[r]});
 assert.equal(validateAircraftContext(wrap(context)).associations.length,1);
 for(const field of ['hex','registration','aircraftId','lat','email','onboard'])assert.throws(()=>validateAircraftContext(wrap({...context,[field]:'not allowed'})),/forbidden/);
 for(const field of ['status','relationship','confidence','lastVerifiedAt','sourceUrl']){const r={...context};delete r[field];assert.throws(()=>validateAircraftContext(wrap(r)));}
});
test('AirLabs permissions fail closed and positions require separate coverage evidence',()=>{
 assert.equal(airlabsUsageAllowed(),false);assert.equal(airlabsUsageAllowed(verifiedAirLabs),true);
 for(const key of ['publicDisplay','commercialUse','caching','historicalRetention','derivedData','attribution'])assert.equal(airlabsUsageAllowed({...verifiedAirLabs,permissions:{...verifiedAirLabs.permissions,[key]:'UNRESOLVED'}}),false);
 assert.equal(airlabsPositionUsageAllowed({...verifiedAirLabs,permissions:{...verifiedAirLabs.permissions,registrationIcaoLookup:'UNRESOLVED'}}),false);
 assert.equal(airlabsUsageAllowed({...verifiedAirLabs,evidence:[]}),false);
});
test('configured key and billing cannot bypass unresolved terms or spend quota',async()=>{
 let requests=0,reserved=0;const live=createPremiumLive({env:{SKYWARD_AIRLABS_MODE:'live',SKYWARD_BILLING_MODE:'live',AIRLABS_API_KEY:'fixture'},paid:async()=>true,reserve:async()=>reserved++,fetchImpl:async()=>requests++});
 assert.equal(live.enabled,false);
 await assert.rejects(live.flight({}, {callsign:'AAL6'}),e=>e.status===503);
 await assert.rejects(live.schedules({},'IAD','departures'),e=>e.status===503);
 assert.equal(requests,0);assert.equal(reserved,0);
});

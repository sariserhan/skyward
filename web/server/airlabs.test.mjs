import test from 'node:test';
import assert from 'node:assert/strict';
import {airlabsPreview, fetchAirLabsFlight, normalizeFlight} from './airlabs.mjs';
const now = 1790503200000;
const row = {flight_icao: 'AAL6', hex: 'aab812', updated: now/1000, dep_iata: 'OGG', arr_iata: 'DFW', dep_time_ts: now/1000, arr_gate: 'A24'};
const expected = {callsign: 'AAL6', hex: 'aab812'};
test('AirLabs preview stays synthetic and disabled/live flags never expose real data', () => {
  assert.equal(airlabsPreview('demo').flight.callsign, 'DEMO101');
  for (const mode of [undefined,'live','disabled']) assert.equal(airlabsPreview(mode).flight, null);
  assert.equal(airlabsPreview('demo').passengers.onboardCount, null);
});
test('AirLabs normalizes timestamps, preserves missing values and excludes raw fields', () => {
  const r = normalizeFlight({response: {...row, passengers: ['PRIVATE'], request: {api_key: 'SECRET'}}}, expected, now);
  assert.equal(r.status, 'MATCHED_RECENT_AIRCRAFT');
  assert.equal(r.flight.departure.scheduledAt, now);
  assert.equal(r.flight.arrival.estimatedAt, null);
  assert.equal(r.flight.departure.terminal, null);
  assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('AirLabs refuses wrong callsign, mismatched hex and old recurring-flight instances', () => {
  for (const changes of [{flight_icao:'AAL7'}, {hex:'bbbbbb'}, {updated:now/1000-301}, {updated:now/1000+61}, {updated:null}]) {
    assert.equal(normalizeFlight({response:{...row,...changes}}, expected, now).flight, null);
  }
  assert.equal(normalizeFlight({response:row}, {callsign:'AAL6'}, now).status,'UNVERIFIED_FLIGHT_INSTANCE');
  assert.equal(normalizeFlight({response:null},expected,now).status,'NOT_FOUND');
});
test('AirLabs makes exactly one fixed-origin request and sanitizes credentials and errors', async () => {
  let calls=0;
  const fetchImpl=async (url, options) => {
    calls++; assert.equal(url.origin,'https://airlabs.co');assert.equal(url.pathname,'/api/v9/flight');
    assert.equal(url.searchParams.get('flight_icao'),'AAL6');assert.equal(options.redirect,'error');
    return {ok:true,json:async()=>({response:row,request:{api_key:'secret'}})};
  };
  const result=await fetchAirLabsFlight({apiKey:'secret',...expected,fetchImpl,now});
  assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('secret'));
  await assert.rejects(fetchAirLabsFlight({apiKey:'secret',...expected,fetchImpl:async()=>{calls++;throw new Error('secret');}}), /No automatic retry/);
  assert.equal(calls,2);
  await assert.rejects(fetchAirLabsFlight({apiKey:'secret',...expected,fetchImpl:async()=>({ok:true,json:async()=>({error:{message:'secret'}})})}), /Check account/);
});
test('Invalid identity and missing credentials fail before the network', async () => {
  const fetchImpl=()=>{assert.fail('must not fetch');};
  for(const input of [{callsign:'../../secret',apiKey:'key'}, {callsign:'AAL6',apiKey:''}, {callsign:'AAL6',apiKey:'key',hex:'bad'}]) await assert.rejects(fetchAirLabsFlight({...input,fetchImpl}));
});
test('Public AirLabs endpoint never spends provider quota, even with a key and forged paid claims', async () => {
  const {server}=await import('./index.mjs');
  const originalMode=process.env.SKYWARD_AIRLABS_MODE;
  const originalKey=process.env.AIRLABS_API_KEY;
  const originalFetch=globalThis.fetch;
  let upstreamCalls=0;
  globalThis.fetch=(url, options)=>{
    if(new URL(url).hostname==='airlabs.co') {upstreamCalls++;throw new Error('Public requests must never reach AirLabs');}
    return originalFetch(url, options);
  };
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    process.env.AIRLABS_API_KEY='server-secret-test-only';
    process.env.SKYWARD_AIRLABS_MODE='live';
    for(const options of [undefined, {headers:{Authorization:'Bearer fake-paid-token',Cookie:'premium=true; plan=paid', 'X-Plan':'paid'}}]) {
      const r=await fetch(base+'/api/flight-details?mode=live&callsign=AAL6&paid=true&plan=premium',options);
      assert.equal(r.status,200);
      const body=await r.json();
      assert.equal(body.mode,'disabled');assert.equal(body.flight,null);
      assert.ok(!JSON.stringify(body).includes('server-secret'));
    }
    process.env.SKYWARD_AIRLABS_MODE='demo';
    const r=await fetch(base+'/api/flight-details?callsign=AAL6&paid=true');
    assert.equal((await r.json()).flight.callsign,'DEMO101');
    assert.equal(upstreamCalls,0);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalMode===undefined)delete process.env.SKYWARD_AIRLABS_MODE;else process.env.SKYWARD_AIRLABS_MODE=originalMode;
    if(originalKey===undefined)delete process.env.AIRLABS_API_KEY;else process.env.AIRLABS_API_KEY=originalKey;
    await new Promise(resolve=>server.close(resolve));
  }
});

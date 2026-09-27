import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAircraft, normalizePayload, searchPath, FeedClient } from './feed.mjs';
test('preserves real zero values and observation age', () => {
  const a = normalizeAircraft({ hex: 'AB12EF', flight: ' THY7 ', lat: 0, lon: 0, seen_pos: 5, gs: 0, track: 0, alt_baro: 'ground' }, 100000);
  assert.equal(a.observedAt, 95000); assert.equal(a.groundSpeed, 0); assert.equal(a.altitude, 0); assert.equal(a.callsign, 'THY7');
});
test('missing position age is unknown, never fresh', () => {
  assert.equal(normalizeAircraft({ hex: 'abcdef', lat: 40, lon: -70 }, 100000).observedAt, null);
  assert.equal(normalizeAircraft({ hex: 'abcdef', lat: 99, lon: 0, seen_pos: 0 }, 100000).lat, null);
});
test('rejects malformed payloads, timestamps and unsafe queries', () => {
  assert.throws(() => normalizePayload({ ac: [], now: 0 }, Date.now()));
  assert.throws(() => normalizePayload({ now: Date.now() }));
  assert.throws(() => searchPath('callsign', '../airport'));
  assert.equal(searchPath('callsign', ' thy7 '), '/v2/callsign/THY7');
});
test('shares concurrent queries and cached observations without refreshing timestamps', async () => {
  let calls = 0;
  const client = new FeedClient(async () => { calls++; return { ok: true, json: async () => ({ ac: [], now: Date.now() }) }; });
  const [a, b] = await Promise.all([client.area('IAD'), client.area('IAD')]);
  assert.equal(calls, 1); assert.equal(a.fetchedAt, b.fetchedAt);
  assert.equal((await client.area('IAD')).fetchedAt, a.fetchedAt); assert.equal(calls, 1);
});
test('upstream failure is an error, never an empty successful live feed', async () => {
  const client = new FeedClient(async () => ({ ok: false, status: 503 }));
  await assert.rejects(client.area('IST'));
});

test('selected hex refresh expires sooner while preserving cached observation timestamps', async () => {
 let calls=0;const client=new FeedClient(async()=>({ok:true,json:async()=>{calls++;return {ac:[],now:Date.now()};}}));
 const first=await client.search('hex','abcdef'),entry=[...client.cache.values()][0];
 assert.ok(entry.expires-first.fetchedAt<=8100);assert.ok(entry.expires-first.fetchedAt>=7900);
 assert.equal((await client.search('hex','abcdef')).fetchedAt,first.fetchedAt);assert.equal(calls,1);
 entry.expires=0;client.nextAt=0;await client.search('hex','abcdef');assert.equal(calls,2);
});

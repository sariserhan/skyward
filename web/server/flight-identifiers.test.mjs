import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingFlightCode,passengerFlightAlias,flightDisplayCode,isFlightSearch} from '../shared/flight-identifiers.mjs';
import {searchPath} from './feed.mjs';
import {matchesFlightSearch,emptySearch} from '../src/lib/flightSearch.ts';
test('passenger flight numbers and tracking codes resolve to the same cached provider path',()=>{
 for(const code of ['UA613','ua 613','UA0613','UAL613'])assert.equal(searchPath('callsign',code),'/v2/callsign/UAL613');
 for(const [ticket,tracking] of [['TK8','THY8'],['B6123','JBU123'],['AC7','ACA7'],['AF23','AFR23'],['NH5','ANA5'],['EK1','UAE1'],['A3123','AEE123']])assert.equal(trackingFlightCode(ticket),tracking);
 assert.equal(searchPath('registration','N613UA'),'/v2/reg/N613UA');
 assert.equal(searchPath('hex','abcdef'),'/v2/hex/ABCDEF');
});
test('unknown airlines, alphanumeric callsigns and private identities are not fabricated',()=>{
 assert.throws(()=>trackingFlightCode('ZZ613'),/not supported/);
 assert.equal(trackingFlightCode('THY9WR'),'THY9WR');assert.equal(passengerFlightAlias('THY9WR'),null);
 assert.equal(passengerFlightAlias('N821SS'),null);assert.equal(flightDisplayCode('UAL613'),'UA613 · UAL613');
 assert.ok(isFlightSearch('UA 613'));assert.ok(isFlightSearch('UAL613'));
 assert.equal(isFlightSearch('United'),false);
});
test('received-aircraft search accepts ticket number as well as tracking code',()=>{
 const a={hex:'abcdef',callsign:'UAL613',registration:'N613UA',aircraftType:'B738'};
 for(const text of ['UA613','UAL613','United'])assert.ok(matchesFlightSearch(a,{...emptySearch,text}));
 assert.equal(matchesFlightSearch(a,{...emptySearch,text:'UA614'}),false);
});

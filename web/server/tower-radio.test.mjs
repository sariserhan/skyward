import test from 'node:test';
import assert from 'node:assert/strict';
import {TowerRadioPlanner,towerRadioPhase} from '../src/lib/towerRadio.ts';
test('Tower radio gives every nearby aircraft a tower call and pilot readback without repeat flooding',()=>{
 const planner=new TowerRadioPlanner(),traffic=[{identity:'a',callsign:'SKY1',phase:'approach'},{identity:'b',callsign:'SKY2',phase:'taxi'}];
 const first=planner.next(traffic,1000);assert.equal(first.length,2);assert.match(first[0].text,/SKY1/);assert.match(first[1].text,/SKY1/);assert.ok(first.every(l=>l.channel==='radio'));
 assert.match(planner.next(traffic,2000)[0].text,/SKY2/);assert.deepEqual(planner.next(traffic,3000),[]);
 assert.match(planner.next([{...traffic[0],phase:'rollout'},traffic[1]],4000)[0].text,/clear of the runway/);
 assert.match(planner.next(traffic,94000)[0].text,/SKY2/);
});
test('Tower radio forgets departed traffic and maps demonstration stages to relevant exchanges',()=>{
 const p=new TowerRadioPlanner(),traffic=[{identity:'a',callsign:'SKY1',phase:'ground'}];p.next(traffic,1000);p.next([],2000);assert.equal(p.next(traffic,3000).length,2);
 for(const [phase,expected] of [['landing','approach'],['flare','approach'],['rollout','rollout'],['taxi in','taxi'],['taxi out','taxi'],['gate service','parked'],['takeoff','climb']])assert.equal(towerRadioPhase(phase),expected);
});

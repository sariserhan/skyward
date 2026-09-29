import test from 'node:test';import assert from 'node:assert/strict';
import {touchdownTransition} from '../src/lib/touchdown.ts';
test('touchdown emits only on airborne-to-ground wheel contact, never initial ground/taxi or gear-up contact',()=>{
 const air={ground:false,gear:1},ground={ground:true,gear:1,speed:130};
 assert.equal(touchdownTransition(null,ground),false);assert.equal(touchdownTransition(air,ground),true);assert.equal(touchdownTransition(ground,ground),false);
 assert.equal(touchdownTransition(air,{...ground,gear:0}),false);assert.equal(touchdownTransition(air,{...ground,speed:10}),false);assert.equal(touchdownTransition(ground,{...ground,ground:false}),false);
});

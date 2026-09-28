import test from 'node:test';import assert from 'node:assert/strict';
import {validateLibrary} from './account-library.mjs';
const result={from:'IAD',to:'DCA',difficulty:'advanced',result:'crashed',duration:300,touchdownRate:-1500,aircraftType:'B738',occupants:168,fatalities:168,fuelRemainingKg:0,fuelExhausted:true};
test('Career retains fictional fuel/crash results and rejects impossible counts',()=>{
 const saved=validateLibrary('missions',result);assert.equal(saved.occupants,168);assert.equal(saved.fatalities,168);assert.equal(saved.fuelRemainingKg,0);assert.equal(saved.fuelExhausted,true);
 for(const patch of [{fatalities:169},{occupants:1000},{fatalities:-1},{fatalities:2.5},{result:'landed'},{fuelRemainingKg:-1},{fuelRemainingKg:Infinity}])assert.throws(()=>validateLibrary('missions',{...result,...patch}));
 const old={...result};for(const k of ['occupants','fatalities','fuelRemainingKg','fuelExhausted'])delete old[k];assert.equal(validateLibrary('missions',old).result,'crashed');
});

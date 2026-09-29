import test from 'node:test';
import assert from 'node:assert/strict';
import {publishWeatherAudio,publishThunder,clearWeatherAudio,readWeatherAudio,thunderProfile} from '../src/lib/weatherAudio.ts';
test('rain ambience does not require lightning and weather cues remain viewer-local',()=>{
 const a={},b={};publishWeatherAudio(a,.7,false);publishThunder(a,1000);assert.deepEqual(readWeatherAudio(a),{rain:.7,storm:false,strike:undefined});assert.equal(readWeatherAudio(b),undefined);
 publishWeatherAudio(a,1,true);publishThunder(a,3430);const strike=readWeatherAudio(a).strike;assert.equal(strike.distance,3430);publishWeatherAudio(a,.5,true);assert.equal(readWeatherAudio(a).strike,strike);
 publishWeatherAudio(a,.4,false);assert.equal(readWeatherAudio(a).strike,undefined);clearWeatherAudio(a);assert.equal(readWeatherAudio(a),undefined);
});
test('distant thunder arrives later, quieter and more muffled; invalid distance is bounded',()=>{
 const near=thunderProfile(343),far=thunderProfile(6860);assert.equal(near.delay,1);assert.equal(far.delay,20);assert(far.gain<near.gain);assert(far.cutoff<near.cutoff);assert.equal(thunderProfile(-10).delay,0);assert.equal(thunderProfile(100000).delay,60);assert(Number.isFinite(thunderProfile(NaN).gain));
});

import {weatherSkyAmount} from '../src/lib/weatherSky.ts';
test('heavy storms grey the sky below cloud tops; light rain and views above remain clearer',()=>{
 const report={clouds:[{cover:'SCT',baseM:1000}],rain:.35,storm:false,elevationM:0};
 const light=weatherSkyAmount(report,500),heavy=weatherSkyAmount({...report,rain:.9},500),storm=weatherSkyAmount({...report,storm:true},500);
 assert(light<.3);assert(heavy>=.7);assert.equal(storm,1);assert.equal(weatherSkyAmount({...report,storm:true},10000),0);assert.equal(weatherSkyAmount({...report,rain:0,clouds:[]},500),0);
});

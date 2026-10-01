import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewIdentities} from '../src/lib/airframeReview.ts';
const identity={value:'N123AA',validFrom:null,validTo:null,confidence:'HIGH'},a={id:'frame-one',manufacturer:'Example',serialNumber:'123',registrations:[identity],icaoIdentities:[]};
test('review suggests scoped serial matches but does not mutate catalog',()=>{
 const c={aircraft:[a,{...a,id:'frame-two'}]},before=JSON.stringify(c);assert.equal(reviewIdentities(c)[0].kind,'DUPLICATE_CANDIDATE');assert.equal(JSON.stringify(c),before);
 assert.equal(reviewIdentities({aircraft:[a,{...a,id:'frame-two',manufacturer:'Other'}]})[0].kind,'IDENTIFIER_CONFLICT');
});
test('nonoverlapping reuse and low confidence do not produce identifier conflicts',()=>{
 const b={...a,id:'frame-two',serialNumber:'456',registrations:[{...identity,validFrom:'2025-01-01'}]};
 assert.equal(reviewIdentities({aircraft:[{...a,registrations:[{...identity,validTo:'2025-01-01'}]},b]}).length,0);
 assert.equal(reviewIdentities({aircraft:[{...a,registrations:[{...identity,confidence:'LOW'}]},b]}).length,0);
});

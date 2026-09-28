import test from 'node:test';
import assert from 'node:assert/strict';
import {developmentPremium} from './development-premium.mjs';
test('Development entitlement requires explicit server configuration and refuses production/public origins',()=>{
 const env={NODE_ENV:'development',SKYWARD_DEV_PREMIUM:'1',SKYWARD_ACCOUNTS:'test'};
 assert.equal(developmentPremium(env),true);
 assert.equal(developmentPremium({...env,SKYWARD_ACCOUNTS:'neon'}),true);
 assert.equal(developmentPremium({NODE_ENV:'development'}),false);
 assert.equal(developmentPremium({NODE_ENV:'production'}),false);
 for(const change of [{NODE_ENV:'production'},{NODE_ENV:undefined},{SKYWARD_PUBLIC_ORIGIN:'https://skyward.example'},{SKYWARD_PUBLIC_ORIGIN:'http://localhost.evil.example'},{SKYWARD_ACCOUNTS:'disabled'}])assert.throws(()=>developmentPremium({...env,...change}));
});

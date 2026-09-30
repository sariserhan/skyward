import {createAccountMembership} from './account-membership.mjs';
import {createNeonPool,createNeonAuth,neonConfig} from './neon-auth.mjs';
export function createNeonMembership(options={}){
 const env=options.env??process.env,pool=options.pool??createNeonPool(env),{origin}=neonConfig(env);
 return createAccountMembership({...options,env,pool,origin,auth:createNeonAuth(pool,{env,sendEmail:options.sendEmail})});
}

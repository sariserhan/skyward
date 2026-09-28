/** Server-only development entitlement. Never inferred from browser input. */
export function developmentPremium(env=process.env) {
 if(env.SKYWARD_DEV_PREMIUM!=='1')return false;
 if(env.NODE_ENV!=='development')throw Error('Development Premium requires NODE_ENV=development.');
 const site=new URL(env.SKYWARD_PUBLIC_ORIGIN||'http://localhost:8000');
 if(!['localhost','127.0.0.1','[::1]'].includes(site.hostname))throw Error('Development Premium requires a loopback public origin.');
 if(!['test','neon'].includes(env.SKYWARD_ACCOUNTS))throw Error('Development Premium requires an enabled account backend.');
 return true;
}

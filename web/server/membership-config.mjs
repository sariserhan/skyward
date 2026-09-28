export async function createConfiguredMembership(options={}) {
 const env=options.env??process.env;
 if(env.SKYWARD_ACCOUNTS==='neon')return (await import('./neon-membership.mjs')).createNeonMembership(options);
 if(env.SKYWARD_ACCOUNTS&&!['test','disabled'].includes(env.SKYWARD_ACCOUNTS))throw Error('SKYWARD_ACCOUNTS must be neon or test (or disabled/unset to disable accounts).');
 return (await import('./membership.mjs')).createMembership(options);
}

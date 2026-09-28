/** Explicit local developer tool; there is no HTTP entitlement-grant endpoint. */
import {createMembership} from '../server/membership.mjs';
const [action,email]=process.argv.slice(2);
if(!['grant','revoke'].includes(action)||!email||process.env.SKYWARD_ACCOUNTS!=='test'||process.env.SKYWARD_LOCAL_PREMIUM!=='1'){
 console.error('Use SKYWARD_ACCOUNTS=test SKYWARD_LOCAL_PREMIUM=1 npm run premium:test -- grant|revoke email');
 process.exit(1);
}
const m=createMembership();
try{
 const u=m.db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
 if(!u)throw Error('Create the test account in the app first. Use the same account database as the server.');
 if(action==='grant')m.db.prepare('INSERT INTO local_test_access VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires').run(u.id,Date.now()+7*86400000);
 else m.db.prepare('DELETE FROM local_test_access WHERE user_id=?').run(u.id);
 console.log(action==='grant'?'Local Premium test access granted for seven days. No payments or live paid data.':'Local Premium test access revoked.');
}finally{m.close();}

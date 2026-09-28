import {readFile} from 'node:fs/promises';
import {getMigrations} from 'better-auth/db/migration';
import {createNeonPool,createNeonAuth} from '../server/neon-auth.mjs';
export async function migrateNeon(pool,auth){
 const migration=await getMigrations(auth.options);
 await migration.runMigrations();
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('skyward:schema',0))");
  await client.query(await readFile(new URL('../server/migrations/001-account-data.sql',import.meta.url),'utf8'));
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const env={...process.env,DATABASE_URL:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL};
 const pool=createNeonPool(env),auth=createNeonAuth(pool,{env,sendEmail:()=>{throw Error('Migrations never send email.');}});
 try{await migrateNeon(pool,auth);console.log('Better Auth and Skyward Postgres schema migrated.');}
 catch{console.error('Migration failed. Check database access and the migration schema; connection details are not logged.');process.exitCode=1;}
 finally{await pool.end();}
}

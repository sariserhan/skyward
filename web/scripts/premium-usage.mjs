const month=new Date().toISOString().slice(0,7);
let close=()=>{};
try {
 let totals;
 if(process.env.SKYWARD_ACCOUNTS==='neon'){
  const {createNeonPool}=await import('../server/neon-auth.mjs'),pool=createNeonPool();close=()=>pool.end();
  const {rows}=await pool.query('SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(cost),0) AS "reservedMicros" FROM skyward_usage WHERE month=$1',[month]);totals={requests:Number(rows[0].requests),reservedMicros:Number(rows[0].reservedMicros)};
 }else{
  const {DatabaseSync}=await import('node:sqlite'),db=new DatabaseSync(process.env.SKYWARD_ACCOUNT_DB||'.local/accounts.sqlite',{readOnly:true});close=()=>db.close();
  totals=db.prepare('SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(cost),0) reservedMicros FROM usage WHERE month=?').get(month);
 }
 console.log(JSON.stringify({mode:'test',month,...totals,reservedTestBudgetUsd:totals.reservedMicros/1000000,actualFlightDataSpendUsd:0,monthlyRequestCap:Number(process.env.SKYWARD_GLOBAL_LOOKUPS||1000),monthlyReservedBudgetUsd:Number(process.env.SKYWARD_BUDGET_MICROS||1000000)/1000000},null,2));
}catch{console.error('No readable membership database. Check account configuration and migrations.');process.exitCode=1;}
finally{await close();}

import {DatabaseSync} from 'node:sqlite';
const month=new Date().toISOString().slice(0,7);
try {
  const db=new DatabaseSync(process.env.SKYWARD_ACCOUNT_DB||'.local/accounts.sqlite',{readOnly:true});
  const totals=db.prepare('SELECT COALESCE(SUM(requests),0) requests,COALESCE(SUM(cost),0) reservedMicros FROM usage WHERE month=?').get(month);
  console.log(JSON.stringify({mode:'test',month,...totals,reservedTestBudgetUsd:totals.reservedMicros/1000000,actualFlightDataSpendUsd:0,monthlyRequestCap:Number(process.env.SKYWARD_GLOBAL_LOOKUPS||1000),monthlyReservedBudgetUsd:Number(process.env.SKYWARD_BUDGET_MICROS||1000000)/1000000},null,2));db.close();
}catch{console.error('No readable membership database. Start the test server and make a test lookup first.');process.exitCode=1;}

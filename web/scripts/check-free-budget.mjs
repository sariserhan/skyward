// Read-only audit. Never prints credentials or changes account plans/budgets.
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account){console.error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Billing Read is needed for account-wide consumption.');process.exit(1);}
const report={checkedAt:new Date().toISOString(),readOnly:true,freeTierGuaranteed:false,results:{}};
for(const path of ['subscriptions','d1/database','billable-usage']){
 try{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)}),data=await r.json();
 if(!r.ok||!data.success){report.results[path]={available:false,status:r.status,reason:'Read permission unavailable or provider request failed'};continue;}
 const rows=Array.isArray(data.result)?data.result:[];
 report.results[path]={available:true,items:rows.map(v=>path==='d1/database'?{name:v.name,bytes:v.file_size}:path==='subscriptions'?{ratePlan:v.rate_plan?.id,state:v.state}:{service:v.ServiceName,periodStart:v.ChargePeriodStart,periodEnd:v.ChargePeriodEnd,quantity:v.ConsumedQuantity,unit:v.ConsumedUnit,cumulativeQuantity:v.CumulatedPricingQuantity,cumulativeCost:v.CumulatedContractedCost,currency:v.BillingCurrency}),pagination:data.result_info??null};
 }catch{report.results[path]={available:false,reason:'Request failed or timed out'};}
}
report.note='Usage can lag by a day. Shared-account traffic, operation classes, plan allowances and pagination need review. This report does not enforce a spending cap.';
console.log(JSON.stringify(report,null,2));
if(Object.values(report.results).some(v=>!v.available))process.exitCode=2;

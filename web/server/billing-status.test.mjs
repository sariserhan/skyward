import test from 'node:test';import assert from 'node:assert/strict';
import {billingConfigured,subscriptionSummary} from './billing-status.mjs';
const env={SKYWARD_BILLING_MODE:'live',STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_PUBLISHABLE_KEY:'pk_live_fixture',STRIPE_PRICE_ANNUAL_ID:'price_year',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
const now=1800000000000,s={created:1,livemode:true,status:'active',customer:'cus_member',latest_invoice:{customer:'cus_member',status:'paid',amount_paid:5999},items:{data:[{price:{id:'price_year'},current_period_end:now/1000+86400}]}};
test('checkout readiness requires matching keys, price and live webhook',()=>{
 assert.equal(billingConfigured(env),true);
 for(const key of ['STRIPE_SECRET_KEY','STRIPE_PUBLISHABLE_KEY','STRIPE_PRICE_ANNUAL_ID','STRIPE_WEBHOOK_SECRET'])assert.equal(billingConfigured({...env,[key]:''}),false);
 assert.equal(billingConfigured({...env,STRIPE_PUBLISHABLE_KEY:'pk_test_fixture'}),false);assert.equal(billingConfigured({...env,STRIPE_PRICE_ANNUAL_ID:'prod_wrong'}),false);
});
test('subscription summary verifies payment, customer, price and period; cancellation keeps paid remaining access',()=>{
 const summary=subscriptionSummary([{...s,cancel_at_period_end:true}],env,'cus_member',now);assert.equal(summary.premium,true);assert.equal(summary.cancelAtPeriodEnd,true);assert.equal(summary.periodEndsAt,now+86400000);
 for(const change of [{livemode:false},{status:'past_due'},{status:'trialing'},{customer:'cus_other'},{latest_invoice:{...s.latest_invoice,amount_paid:0}},{latest_invoice:{...s.latest_invoice,customer:'cus_other'}},{items:{data:[{price:{id:'price_wrong'},current_period_end:now/1000+1}]}},{items:{data:[{price:{id:'price_year'},current_period_end:now/1000-1}]}}])assert.equal(subscriptionSummary([{...s,...change}],env,'cus_member',now).premium,false);
 const current=subscriptionSummary([s,{...s,created:5,status:'canceled'}],env,'cus_member',now);assert.equal(current.status,'active');assert.equal(current.premium,true);
});

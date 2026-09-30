import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {createHmac} from 'node:crypto';
import {checkoutPlans,selectedPrice,embeddedSessionParams,embeddedSessionResult,checkoutStatus,existingSubscription} from './stripe-checkout.mjs';
import {createStripeWebhook,verifyStripeEvent} from './stripe-webhook.mjs';
const env={STRIPE_PRICE_ANNUAL_ID:'price_year',STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'},user={id:'u1',customer:'cus_fixture'},now=1790593200000;
const price={id:'price_year',livemode:false,active:true,type:'recurring',unit_amount:5999,currency:'usd',recurring:{interval:'year',interval_count:1}};
const session={id:'cs_test_fixture',livemode:false,customer:'cus_fixture',client_reference_id:'u1',mode:'subscription',status:'open',client_secret:'cs_test_fixture_secret_fixture'};
test('annual checkout uses server-owned recurring price, validates billing mode, and never accepts monthly',async()=>{
 assert.equal(selectedPrice(env),'price_year');assert.throws(()=>selectedPrice(env,'monthly'),/annual/);assert.throws(()=>selectedPrice(env,'price_untrusted'),/annual/);
 assert.deepEqual((await checkoutPlans(env,async()=>price,false)).plans[0],{id:'annual',amount:5999,currency:'usd',interval:'year',taxBehavior:'unspecified'});
 for(const replacement of [{recurring:{interval:'month',interval_count:1}},{livemode:true},{active:false},{currency:'jpy'},{unit_amount:0}])await assert.rejects(checkoutPlans(env,async()=>({...price,...replacement}),false));
 const params=embeddedSessionParams({origin:'https://skyvvard.com',user,price:'price_year'});assert.equal(params.ui_mode,'embedded_page');assert.equal(params.mode,'subscription');assert.equal(params.success_url,undefined);assert.match(params.return_url,/\/account\/\?checkout=return/);
 assert.equal(embeddedSessionResult(session,{env,live:false,user}).publishableKey,'pk_test_fixture');assert.throws(()=>embeddedSessionResult({...session,customer:'cus_other'},{env,live:false,user}));assert.throws(()=>embeddedSessionResult(session,{env,live:true,user}));
});
test('checkout returns never grant Premium, foreign sessions fail and existing unpaid subscriptions cannot duplicate',async()=>{
 assert.equal((await checkoutStatus(session.id,user,async()=>({...session,status:'complete',payment_status:'paid'}),async()=>false,false)).premium,false);
 await assert.rejects(checkoutStatus(session.id,{id:'other',customer:'cus_other'},async()=>session,async()=>true,false),/not found/);
 for(const status of ['active','past_due','incomplete','trialing','paused','unpaid'])await assert.rejects(existingSubscription(user,env,async()=>({data:[{status,items:{data:[{price:{id:'price_year'}}]}}]})),/already exists/);
});
const makeEvent=(id='evt_one',type='invoice.paid')=>({id,type,livemode:false,created:now/1000,data:{object:{customer:'cus_fixture'}}});
const signed=(event,t=now/1000)=>{const raw=Buffer.from(JSON.stringify(event)),signature=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(t+'.').update(raw).digest('hex');return {raw,header:`t=${t},v1=${signature}`};};
const req=(event,t)=>{const {raw,header}=signed(event,t);const r=Readable.from([raw]);r.method='POST';r.headers={'stripe-signature':header};return r;};
test('webhook signature checks original bytes, timestamp, rotation and mode before any state write',async()=>{
 const {raw,header}=signed(makeEvent());assert.equal(verifyStripeEvent(raw,header,env.STRIPE_WEBHOOK_SECRET,now).id,'evt_one');assert.throws(()=>verifyStripeEvent(Buffer.concat([raw,Buffer.from(' ')]),header,env.STRIPE_WEBHOOK_SECRET,now));assert.throws(()=>verifyStripeEvent(raw,header,env.STRIPE_WEBHOOK_SECRET,now+301000));assert.throws(()=>verifyStripeEvent(raw,header,undefined,now));assert.equal(verifyStripeEvent(raw,header+',v1='+'0'.repeat(64),env.STRIPE_WEBHOOK_SECRET,now).id,'evt_one');
 const handle=createStripeWebhook({env,now:()=>now,store:{},findUser:()=>{throw Error('must not reach storage');},entitlement:async()=>false});await assert.rejects(handle(req({...makeEvent(),livemode:true})),/mode mismatch/);
});
test('webhooks deduplicate, reconcile current truth for late events, stay bounded, and retry failed processing',async()=>{
 let saved=null,calls=0,writes=0,paid=true,fail=false;
 const handle=createStripeWebhook({env,now:()=>now,findUser:async()=>user,store:{get:async()=>saved,put:async(_u,_k,_id,v)=>{saved=v;writes++;}},entitlement:async()=>{calls++;if(fail)throw Error('provider down');return paid;}});
 await Promise.all([handle(req(makeEvent())),handle(req(makeEvent()))]);assert.equal(calls,1);assert.equal(writes,1);assert.equal(saved.premium,true);
 paid=false;await handle(req(makeEvent('evt_cancel','customer.subscription.deleted')));await handle(req({...makeEvent('evt_late'),created:1}));assert.equal(saved.premium,false);
 fail=true;await assert.rejects(handle(req(makeEvent('evt_retry'))));assert.ok(!saved.events.includes('evt_retry'));fail=false;await handle(req(makeEvent('evt_retry')));
 for(let i=0;i<40;i++)await handle(req(makeEvent('evt_'+i)));assert.equal(saved.events.length,32);assert.ok(!JSON.stringify(saved).includes('cus_fixture'));
});

test('unfinished matching embedded checkout is reused rather than charging through a second session',async()=>{
 const {embeddedCheckout}=await import('./stripe-checkout.mjs');const calls=[];
 const result=await embeddedCheckout({env,live:false,user,origin:'https://skyvvard.com',now:()=>now,stripe:async(path,params)=>{calls.push({path,params});return path.includes('?customer=')?{data:[{...session,ui_mode:'embedded_page'}]}:{...session,line_items:{data:[{price:{id:'price_year'}}]}};}});
 assert.equal(result.sessionId,session.id);assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.params));
});

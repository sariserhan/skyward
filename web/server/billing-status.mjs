import {configuredPrices,stripePrices} from './stripe-checkout.mjs';
export function billingConfigured(env){
 const live=env.SKYWARD_BILLING_MODE==='live',mode=live?'live':'test';
 return !!(env.STRIPE_SECRET_KEY?.startsWith(`sk_${mode}_`)&&env.STRIPE_PUBLISHABLE_KEY?.startsWith(`pk_${mode}_`)&&/^price_[A-Za-z0-9]+$/.test(stripePrices(env).annual)&&(!live||env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')));
}
const id=v=>typeof v==='string'?v:v?.id;
export function subscriptionSummary(data,env,customer,now=Date.now()){
 const live=env.SKYWARD_BILLING_MODE==='live',prices=configuredPrices(env);
 const candidates=(data||[]).filter(s=>s.livemode===live&&id(s.customer)===customer&&s.items?.data?.some(i=>prices.includes(i.price?.id)));
 candidates.sort((a,b)=>(['active','trialing','past_due','unpaid','incomplete','paused'].includes(b.status)?1:0)-(['active','trialing','past_due','unpaid','incomplete','paused'].includes(a.status)?1:0)||(b.created||0)-(a.created||0));
 const s=candidates[0];if(!s)return {status:'none',premium:false,periodEndsAt:null,cancelAtPeriodEnd:false,canManage:!!customer};
 const ends=Math.max(...s.items.data.filter(i=>prices.includes(i.price?.id)).map(i=>Number(i.current_period_end)||0))*1000;
 const premium=s.status==='active'&&s.latest_invoice?.status==='paid'&&s.latest_invoice.amount_paid>0&&id(s.latest_invoice.customer)===customer&&ends>now;
 return {status:s.status,premium,periodEndsAt:ends>0?ends:null,cancelAtPeriodEnd:!!s.cancel_at_period_end,canManage:true};
}

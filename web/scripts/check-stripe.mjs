// Read-only configuration check (test by default, --live explicitly). Never prints API keys, creates a checkout or charges.
import {checkoutPlans,stripePrices} from '../server/stripe-checkout.mjs';
const env=process.env,live=process.argv.includes('--live'),mode=live?'live':'test';
try{
 if(!env.STRIPE_SECRET_KEY?.startsWith(`sk_${mode}_`)||!env.STRIPE_PUBLISHABLE_KEY?.startsWith(`pk_${mode}_`))throw Error(`Use matching ${mode} secret and publishable keys for this read-only check.`);
 const price=stripePrices(env).annual;
 if(!/^price_[A-Za-z0-9]+$/.test(price))throw Error('STRIPE_PRICE_ANNUAL_ID must be the yearly price_ ID, not a prod_ product ID.');
 const stripe=async path=>{const response=await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2026-08-26.dahlia'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Stripe configuration check returned HTTP ${response.status}. Check the account and price.`);return response.json();};
 const {plans}=await checkoutPlans(env,stripe,live);
 const endpoints=await stripe('webhook_endpoints?limit=100'),portals=await stripe('billing_portal/configurations?limit=100');
 const expected=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','invoice.paid','invoice.payment_failed','invoice.payment_action_required','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'];
 const endpoint=endpoints.data?.find(e=>e.url==='https://skyvvard.com/api/billing/webhook'&&e.status==='enabled'&&e.livemode===live);
 const missingEvents=expected.filter(e=>!endpoint?.enabled_events?.includes(e)&&!endpoint?.enabled_events?.includes('*'));
 const portalReady=!!portals.data?.some(p=>p.active&&p.is_default&&p.features?.subscription_cancel?.enabled&&p.features?.payment_method_update?.enabled);
 if(!endpoint||missingEvents.length||!portalReady||!env.STRIPE_WEBHOOK_SECRET)process.exitCode=1;
 console.log(JSON.stringify({mode,plans,webhookRegistered:!!endpoint,missingEvents,portalReady,webhookSecretConfigured:!!env.STRIPE_WEBHOOK_SECRET,note:'Read-only validation; does not prove checkout completion or webhook delivery.'},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}

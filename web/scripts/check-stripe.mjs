// Read-only test-mode check. Never prints API keys, creates a checkout or charges.
import {checkoutPlans,stripePrices} from '../server/stripe-checkout.mjs';
const env=process.env;
try{
 if(!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')||!env.STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_'))throw Error('Use test secret and publishable keys for this local check. Live credentials are deliberately refused.');
 const price=stripePrices(env).annual;
 if(!/^price_[A-Za-z0-9]+$/.test(price))throw Error('STRIPE_PRICE_ANNUAL_ID must be the yearly price_ ID, not a prod_ product ID.');
 const stripe=async path=>{const response=await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2026-08-26.dahlia'},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Stripe configuration check returned HTTP ${response.status}. Check the test account and price.`);return response.json();};
 const {plans}=await checkoutPlans(env,stripe,false);
 console.log(JSON.stringify({mode:'test',plans,webhookSecretConfigured:!!env.STRIPE_WEBHOOK_SECRET,note:'Read-only validation; does not prove checkout completion or webhook delivery.'},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}

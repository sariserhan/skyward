const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export const stripePrices=env=>({annual:env.STRIPE_PRICE_ANNUAL_ID||env.STRIPE_PRICE_ID||''});
export const configuredPrices=env=>Object.values(stripePrices(env)).filter(x=>/^price_[A-Za-z0-9]+$/.test(x));
export function stripePublishableKey(env,live){const key=env.STRIPE_PUBLISHABLE_KEY||'';if(!key.startsWith(live?'pk_live_':'pk_test_'))fail(503,'Embedded checkout is not configured yet.');return key;}
export function selectedPrice(env,plan='annual'){if(plan!=='annual')fail(400,'Skyward offers annual billing only.');const price=stripePrices(env)[plan];if(!/^price_[A-Za-z0-9]+$/.test(price))fail(503,'This billing interval is not configured yet.');return price;}
export async function checkoutPlans(env,stripe,live){
 stripePublishableKey(env,live);
 return {plans:await Promise.all(Object.entries(stripePrices(env)).filter(([,id])=>/^price_[A-Za-z0-9]+$/.test(id)).map(async([id,price])=>{
 const p=await stripe('prices/'+price);if(p.id!==price||p.livemode!==live||!p.active||p.type!=='recurring'||p.recurring?.interval!=='year'||p.recurring.interval_count!==1||!Number.isInteger(p.unit_amount)||p.unit_amount<=0||!/^\w{3}$/.test(p.currency))fail(503,'Subscription price configuration needs attention.');
 // Format on the server from Stripe's decimal amount. Supported launch currencies
 // are two-decimal currencies; do not silently misquote zero/three-decimal ones.
 if(!['usd','eur','gbp','cad','aud','chf'].includes(p.currency))fail(503,'This checkout currency needs display configuration.');
 return {id,amount:p.unit_amount,currency:p.currency,interval:p.recurring.interval,taxBehavior:p.tax_behavior||'unspecified'};
 }))};
}
export function embeddedSessionParams({origin,user,price}){return {mode:'subscription',ui_mode:'embedded_page',customer:user.customer,'line_items[0][price]':price,'line_items[0][quantity]':'1',return_url:origin+'/account/?checkout=return&session_id={CHECKOUT_SESSION_ID}',redirect_on_completion:'if_required',client_reference_id:user.id,'subscription_data[metadata][skyward_user]':user.id};}
export function embeddedSessionResult(c,{env,live,user}){if(c.livemode!==live||c.customer!==user.customer||c.client_reference_id!==user.id||c.mode!=='subscription'||c.status!=='open'||!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(c.id)||typeof c.client_secret!=='string'||!c.client_secret.startsWith(c.id+'_secret_'))fail(503,'Unable to prepare secure checkout.');return {clientSecret:c.client_secret,sessionId:c.id,publishableKey:stripePublishableKey(env,live)};}
export async function checkoutStatus(id,user,stripe,entitlement,live){if(!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(id||''))fail(400,'Invalid checkout session.');const s=await stripe('checkout/sessions/'+id);if(s.livemode!==live||s.customer!==user.customer||s.client_reference_id!==user.id||s.mode!=='subscription')fail(404,'Checkout session not found.');return {status:s.status,paymentStatus:s.payment_status,premium:await entitlement(user)};}
export async function existingSubscription(user,env,stripe){
 const result=await stripe('subscriptions?'+new URLSearchParams({customer:user.customer,status:'all',limit:'100'}));
 if((result.data??[]).some(s=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status)&&s.items?.data?.some(i=>configuredPrices(env).includes(i.price?.id))))fail(409,'A subscription already exists. Use Manage subscription to update it or resolve payment.');
}
export async function embeddedCheckout({env,live,user,origin,stripe,now}){
 const price=selectedPrice(env,'annual');
 const open=await stripe('checkout/sessions?'+new URLSearchParams({customer:user.customer,status:'open',limit:'100'}));
 if(open.has_more)fail(409,'Too many unfinished checkouts. Contact billing support.');
 for(const candidate of open.data??[]){
  if(candidate.client_reference_id!==user.id||candidate.mode!=='subscription'||candidate.ui_mode!=='embedded_page')continue;
  if(!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(candidate.id||''))continue;
  const session=await stripe('checkout/sessions/'+candidate.id+'?expand[]=line_items');
  if(session.line_items?.data?.length===1&&session.line_items.data[0].price?.id===price)return embeddedSessionResult(session,{env,live,user});
  // Stop an obsolete Skyward checkout before allowing the new annual price.
  await stripe('checkout/sessions/'+candidate.id+'/expire',{});
 }
 const session=await stripe('checkout/sessions',embeddedSessionParams({origin,user,price}),`skyward-${live?'live':'test'}-embedded-${user.id}-annual-${Math.floor(now()/1800000)}`);
 return embeddedSessionResult(session,{env,live,user});
}

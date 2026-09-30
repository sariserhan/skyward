import {createHmac,timingSafeEqual} from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const events=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','invoice.paid','invoice.payment_failed','invoice.payment_action_required','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted']);
export function verifyStripeEvent(raw,header,secret,now=Date.now()){
 if(!secret?.startsWith('whsec_'))fail(503,'Billing notifications are not configured.');
 if(typeof header!=='string'||header.length>4096)fail(400,'Invalid billing signature.');
 const pieces=header.split(',').map(p=>p.trim().split('=')),timestamps=pieces.filter(([k])=>k==='t');if(timestamps.length!==1||!/^\d+$/.test(timestamps[0][1]))fail(400,'Invalid billing signature.');
 const timestamp=Number(timestamps[0][1]);if(!Number.isSafeInteger(timestamp)||Math.abs(Math.floor(now/1000)-timestamp)>300)fail(400,'Expired billing signature.');
 const expected=createHmac('sha256',secret).update(String(timestamp)+'.').update(raw).digest();
 if(!pieces.some(([k,v])=>k==='v1'&&/^[a-f0-9]{64}$/i.test(v||'')&&timingSafeEqual(expected,Buffer.from(v,'hex'))))fail(400,'Invalid billing signature.');
 let event;try{event=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Invalid billing event.');}
 if(!/^evt_[A-Za-z0-9]+$/.test(event?.id||'')||typeof event.type!=='string'||typeof event.livemode!=='boolean'||!event.data?.object)fail(400,'Invalid billing event.');return event;
}
export function createStripeWebhook({env,store,findUser,entitlement,now=Date.now,live=false}){
 const inFlight=new Map();
 return async req=>{
  if(req.method!=='POST')fail(405,'Method not allowed.');
  const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>64*1024)fail(413,'Billing event is too large.');chunks.push(chunk);}
  const event=verifyStripeEvent(Buffer.concat(chunks),req.headers['stripe-signature'],env.STRIPE_WEBHOOK_SECRET,now());
  if(event.livemode!==live)fail(400,'Billing mode mismatch.');
  if(!events.has(event.type))return {received:true,ignored:true};
  const rawCustomer=event.data.object.customer,customer=typeof rawCustomer==='string'?rawCustomer:rawCustomer?.id;
  if(!/^cus_[A-Za-z0-9]+$/.test(customer||''))return {received:true,ignored:true};
  const u=await findUser(customer);if(!u)return {received:true,ignored:true};
  // Serialize refreshes within this process. The production Worker also serializes
  // all mutations in its coordinator. This snapshot never grants access itself.
  const previous=inFlight.get(u.id)??Promise.resolve();const current=previous.catch(()=>{}).then(async()=>{
   const old=await store.get(u.id,'billing','subscription');if(old?.events?.includes(event.id))return {received:true,duplicate:true};
   // Query current Stripe state instead of trusting stale/out-of-order payloads.
   const premium=await entitlement({...u,customer});
   await store.put(u.id,'billing','subscription',{premium,lastEventType:event.type,checkedAt:now(),events:[...(old?.events??[]),event.id].slice(-32)},1);
   return {received:true};
  });inFlight.set(u.id,current);try{return await current;}finally{if(inFlight.get(u.id)===current)inFlight.delete(u.id);}
 };
}

import {Wordmark} from './Wordmark';
import {useEffect,useRef,useState} from 'react';
import type {StripeEmbeddedCheckout} from '@stripe/stripe-js';
import {accountRequest} from '../lib/membership';
import {accountChanged} from '../lib/accountEvents';
import './EmbeddedCheckout.css';
type Plan={id:'annual';amount:number;currency:string;interval:'year';taxBehavior:string};
type Session={clientSecret:string;sessionId:string;publishableKey:string};
export function EmbeddedCheckout({mode,onClose}:{mode:'test'|'live';onClose:()=>void}){
 const [plans,setPlans]=useState<Plan[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[status,setStatus]=useState(''),[retry,setRetry]=useState(0);
 const [allowance,setAllowance]=useState<number|null>(null);
 const mount=useRef<HTMLDivElement>(null),active=useRef(true),checking=useRef(false),starting=useRef(false);
 const [returnId]=useState(()=>new URLSearchParams(location.search).get('session_id')||'');
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{let alive=true;accountRequest<{plans:Plan[];monthlyLookups?:number}>('/api/billing/plans').then(r=>{if(alive){setPlans(r.plans);setAllowance(r.monthlyLookups??null);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[retry]);
 async function confirm(id:string){if(checking.current)return;checking.current=true;setBusy(true);setError('');try{const r=await accountRequest<{status:string;paymentStatus:string;premium:boolean}>('/api/billing/session?session_id='+encodeURIComponent(id));if(!active.current)return;if(r.premium){setStatus('Premium is active. Welcome aboard!');accountChanged();}else setStatus(r.status==='expired'?'This checkout expired. Close this panel and start again.':r.status==='open'?'Checkout is not complete. Close this panel to return to your account, then reopen checkout to continue.':'Payment confirmation is pending. Please check again shortly; do not pay a second time.');}catch(e){if(active.current)setError(e instanceof Error?e.message:'Could not verify payment.');}finally{checking.current=false;if(active.current)setBusy(false);}}
 useEffect(()=>{if(returnId)void confirm(returnId);},[returnId]);
 useEffect(()=>{
  if(!session||!mount.current)return;let canceled=false,checkout:StripeEmbeddedCheckout|undefined;setReady(false);
  void (async()=>{try{const {loadStripe}=await import('@stripe/stripe-js/pure');const stripe=await loadStripe(session.publishableKey);if(!stripe)throw Error('Secure payment form could not load.');if(canceled)return;checkout=await stripe.createEmbeddedCheckoutPage({clientSecret:session.clientSecret,onComplete:()=>{if(!canceled)void confirm(session.sessionId);}});if(canceled){checkout.destroy();return;}checkout.mount(mount.current!);setReady(true);}catch(e){if(!canceled)setError(e instanceof Error?e.message:'Secure payment form could not load.');}})();
  return()=>{canceled=true;checkout?.destroy();};
 },[session]);
 async function start(plan:Plan['id']){if(starting.current)return;starting.current=true;setBusy(true);setError('');try{const s=await accountRequest<Session>('/api/billing/checkout',{plan,uiMode:'embedded'});if(active.current)setSession(s);}catch(e){if(active.current)setError(e instanceof Error?e.message:'Checkout unavailable.');}finally{starting.current=false;if(active.current)setBusy(false);}}
 return <section className="embedded-checkout" aria-label="Secure Premium checkout"><header><div><small><Wordmark/> Premium {mode==='test'?'· TEST CHECKOUT':''}</small><h3>Your next journey starts here.</h3></div><button type="button" onClick={onClose} aria-label="Close checkout">Close</button></header>
 <p>Both simulators, saved trips, boarding-pass scanning and expanded flight details within your account allowance. Coverage varies.</p>
 {allowance!==null&&<p>{allowance} premium flight-data lookups per calendar month. Limits reset monthly even with annual billing; no automatic overage charges. Coverage and service capacity vary.</p>}
 {!session&&!returnId&&<div className="checkout-plans">{plans.map(p=><button key={p.id} type="button" disabled={busy} onClick={()=>void start(p.id)}><strong>Yearly</strong><span>{new Intl.NumberFormat(undefined,{style:'currency',currency:p.currency}).format(p.amount/100)} / {p.interval}</span><small>Billed once each year · renews automatically</small></button>)}{!plans.length&&!error&&<p role="status">Loading subscription prices…</p>}</div>}
 {session&&!ready&&!error&&<p role="status">Loading secure payment form…</p>}<div ref={mount} className="checkout-mount"/>
 {status&&<p role="status">{status}</p>}{(session||returnId)&&<button type="button" disabled={busy} onClick={()=>void confirm(session?.sessionId||returnId)}>Check payment status</button>}
 {error&&<div role="alert"><p>{error}</p>{!session&&!returnId&&<button type="button" disabled={busy} onClick={()=>{setError('');setRetry(v=>v+1);}}>Retry</button>}</div>}
 <p className="checkout-disclosure">{mode==='test'?'Test mode: no real charge. ':''}Review the total, currency, tax and billing interval in the secure form before confirming. Your subscription renews until canceled; manage cancellation from your account. Closing this panel does not cancel an existing subscription. <a href="/terms/" target="_blank" rel="noopener noreferrer">Terms</a> · <a href="/privacy/" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="mailto:billing@skyvvard.com">Billing help</a></p>
 </section>;
}

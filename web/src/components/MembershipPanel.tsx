import {useEffect,useState} from 'react';
import {accountRequest,type Account,type Journey} from '../lib/membership';
export function MembershipPanel({openJourney}:{openJourney:(hex:string)=>Promise<void>}) {
  const [account,setAccount]=useState<Account|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[register,setRegister]=useState(false);
  const [journeys,setJourneys]=useState<Journey[]>([]),[alerts,setAlerts]=useState<{id:number;message:string;created:number}[]>([]),[sample,setSample]=useState(false);
  async function reload() {
    const a=await accountRequest<Account>('/api/account');setAccount(a);
    if(a.user){const j=await accountRequest<{journeys:Journey[];alerts:typeof alerts}>('/api/journeys');setJourneys(j.journeys);setAlerts(j.alerts);}else{setJourneys([]);setAlerts([]);}
  }
  useEffect(()=>{let active=true;accountRequest<Account>('/api/account').then(async a=>{if(!active)return;setAccount(a);if(a.user){const j=await accountRequest<{journeys:Journey[];alerts:typeof alerts}>('/api/journeys');if(active){setJourneys(j.journeys);setAlerts(j.alerts);}}}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function perform(action:()=>Promise<void>) {if(busy)return;setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
  async function billing(path:string) {const r=await accountRequest<{url:string}>(path,{});const url=new URL(r.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('Checkout unavailable.');window.location.assign(url.href);}
  return <section className="membership-panel" aria-label="Your account">
    <h3>Your account &amp; journeys</h3>
    {!account&&!message&&<p>Loading account…</p>}
    {account&&!account.enabled&&<p>Account signup and subscriptions are coming soon. Free exploration is available now.</p>}
    {account?.enabled&&<><p className="account-test-note">Test environment · no real payments or live premium flight data.</p>
      {!account.user?<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form);void perform(async()=>{await accountRequest(`/api/account/${register?'register':'login'}`,{email:data.get('email'),password:data.get('password')});form.reset();await reload();});}}>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
        <label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'} required minLength={12} maxLength={128}/></label>
        <small>Use 12–128 characters. Test accounts do not yet offer email verification or password recovery.</small>
        <div className="membership-actions"><button disabled={busy} type="submit">{register?'Create test account':'Sign in'}</button><button type="button" disabled={busy} onClick={()=>setRegister(!register)}>{register?'Already registered?':'Create an account'}</button></div>
      </form>:<><p>{account.user.email} · <strong>{account.user.premium?'Premium · test':'Free'}</strong></p>
        <div className="membership-actions"><button disabled={busy||!account.billingReady} onClick={()=>void perform(()=>billing('/api/billing/checkout'))}>Test premium checkout</button><button disabled={busy||!account.billingReady} onClick={()=>void perform(()=>billing('/api/billing/portal'))}>Manage subscription</button><button disabled={busy} onClick={()=>void perform(reload)}>Refresh subscription</button><button disabled={busy} onClick={()=>void perform(async()=>{await accountRequest('/api/account/logout',{});await reload();})}>Sign out</button></div>
        {!account.billingReady&&<p>Checkout setup is pending. No payment can be taken yet.</p>}
        {account.usage&&<p>Monthly test lookups: {account.usage.requests} / {account.usage.limit}. Actual flight-data spend: $0. No automatic refresh.</p>}
        {account.user.premium&&<p><a href="/airport-simulation/">Play airport simulator →</a></p>}
        <h4>Saved journeys</h4><p>Save a selected flight to return to it here. A saved date identifies your journey; opening it finds the aircraft’s current position, which may be a later flight.</p>
        {!journeys.length&&<p>No saved journeys yet.</p>}
        <ul className="saved-journeys">{journeys.map(j=><li key={j.key}><strong>{j.callsign}</strong> · {j.date}<div className="membership-actions"><button disabled={busy} onClick={()=>void perform(()=>openJourney(j.hex))}>Find aircraft</button><button disabled={busy} aria-pressed={j.alerts} onClick={()=>void perform(async()=>{await accountRequest('/api/journeys',{...j,alerts:!j.alerts});await reload();})}>Alerts {j.alerts?'on':'off'}</button><button disabled={busy} onClick={()=>void perform(async()=>{await accountRequest('/api/journeys',{...j,remove:true});await reload();})}>Remove</button></div></li>)}</ul>
        <h4>Flight alerts</h4><p>In-app changes are recorded when authorized flight details are checked. No background monitoring, email or push delivery. Sample data never creates an alert for a real flight.</p>
        {alerts.length?<ul>{alerts.map(a=><li key={a.id}>{a.message}<small>{new Date(a.created).toLocaleString()}</small></li>)}</ul>:<p>No verified flight changes recorded.</p>}
        <button onClick={()=>setSample(!sample)} aria-expanded={sample}>Preview sample alerts</button>
        {sample&&<ul aria-label="Synthetic alert examples"><li>DEMO101 · Departure reported · sample</li><li>DEMO101 · Gate changed: A2 → A8 · sample</li><li>DEMO101 · Arrival delayed by 15 minutes · sample</li><li>DEMO101 · Arrival reported · sample</li></ul>}
      </>}
    </>}
    {message&&<p role="status">{message}</p>}
  </section>;
}

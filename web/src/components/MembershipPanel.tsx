import {AccountWorkspace} from './AccountWorkspace';
import {accountChanged} from '../lib/accountLibrary';
import {useEffect,useState} from 'react';
import {accountRequest,type Account} from '../lib/membership';
export function MembershipPanel({openJourney}:{openJourney:(hex:string)=>Promise<void>}) {
  const [account,setAccount]=useState<Account|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[register,setRegister]=useState(false);

  async function reload() {
    const a=await accountRequest<Account>('/api/account');setAccount(a);
  }
  useEffect(()=>{let active=true;accountRequest<Account>('/api/account').then(a=>{if(active)setAccount(a);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function perform(action:()=>Promise<void>) {if(busy)return;setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
  async function billing(path:string) {const r=await accountRequest<{url:string}>(path,{});const url=new URL(r.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('Checkout unavailable.');window.location.assign(url.href);}
  return <section className="membership-panel" aria-label="Your account">
    <h3>Your account &amp; journeys</h3>
    {!account&&!message&&<p>Loading account…</p>}
    {account&&!account.enabled&&<p>Account signup and subscriptions are coming soon. Free exploration is available now.</p>}
    {account?.enabled&&<><p className="account-test-note">Test environment · no real payments or live premium flight data.</p>
      {!account.user?<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form);void perform(async()=>{await accountRequest(`/api/account/${register?'register':'login'}`,{email:data.get('email'),password:data.get('password')});form.reset();accountChanged();await reload();});}}>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
        <label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'} required minLength={12} maxLength={128}/></label>
        <small>Use 12–128 characters. Test accounts do not yet offer email verification or password recovery.</small>
        <div className="membership-actions"><button disabled={busy} type="submit">{register?'Create test account':'Sign in'}</button><button type="button" disabled={busy} onClick={()=>setRegister(!register)}>{register?'Already registered?':'Create an account'}</button></div>
      </form>:<><p>{account.user.email} · <strong>{account.user.premium?'Premium · test':'Free'}</strong></p>
        <div className="membership-actions"><button disabled={busy||!account.billingReady} onClick={()=>void perform(()=>billing('/api/billing/checkout'))}>Test premium checkout</button><button disabled={busy||!account.billingReady} onClick={()=>void perform(()=>billing('/api/billing/portal'))}>Manage subscription</button><button disabled={busy} onClick={()=>void perform(reload)}>Refresh subscription</button><button disabled={busy} onClick={()=>void perform(async()=>{await accountRequest('/api/account/logout',{});accountChanged(true);await reload();})}>Sign out</button></div>
        {!account.billingReady&&<p>Checkout setup is pending. No payment can be taken yet.</p>}
        {account.usage&&<p>Monthly test lookups: {account.usage.requests} / {account.usage.limit}. Actual flight-data spend: $0. No automatic refresh.</p>}
        {account.user.premium&&<p><a href="/airport-simulation/">Play airport simulator →</a></p>}
        <AccountWorkspace account={account} openJourney={openJourney}/>
      </>}
    </>}
    {message&&<p role="status">{message}</p>}
  </section>;
}

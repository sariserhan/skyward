import {LoadingSkeleton} from './SystemState';
import {lazy,Suspense} from 'react';
const AccountWorkspace=lazy(()=>import('./AccountWorkspace').then(m=>({default:m.AccountWorkspace})));
import {accountChanged} from '../lib/accountEvents';
import {useEffect,useState} from 'react';
import {accountRequest,disconnectAccountNotifications,type Account} from '../lib/membership';
export function MembershipPanel({openJourney}:{openJourney:(hex:string)=>Promise<void>}) {
  const [account,setAccount]=useState<Account|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[register,setRegister]=useState(false),[recover,setRecover]=useState(false);
  const [resetToken,setResetToken]=useState(()=>new URLSearchParams(window.location.search).get('token')||'');
  const betterAuth=account?.authProvider==='better-auth';
  useEffect(()=>{if(resetToken){const url=new URL(window.location.href);url.searchParams.delete('token');history.replaceState(history.state,'',url);}},[resetToken]);

  async function reload() {
    const a=await accountRequest<Account>('/api/account');setAccount(a);
  }
  useEffect(()=>{let active=true;accountRequest<Account>('/api/account').then(a=>{if(active)setAccount(a);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function perform(action:()=>Promise<void>) {if(busy)return;setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
  async function billing(path:string) {const r=await accountRequest<{url:string}>(path,{});const url=new URL(r.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw Error('Checkout unavailable.');window.location.assign(url.href);}
  if(!account&&!message)return <LoadingSkeleton label="Loading your account…"/>;
  return <section className="membership-panel" aria-label="Your account">
    <h3>Your account &amp; journeys</h3>
    {!account&&message&&<button disabled={busy} onClick={()=>void perform(reload)}>Retry account connection</button>}
    {account&&!account.enabled&&<p>Account signup and subscriptions are coming soon. Free exploration is available now.</p>}
    {account?.enabled&&<><p className="account-test-note">{account.mode==='live'?'Live billing · confirm price and terms in checkout.':'Test environment · no real payments or live premium flight data.'}</p>
      {!account.user||resetToken?<form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form);void perform(async()=>{
        if(betterAuth&&resetToken){await accountRequest('/api/auth/reset-password',{token:resetToken,newPassword:data.get('password')});setResetToken('');setRecover(false);accountChanged(true);await reload();setMessage('Password updated. Sign in with your new password.');form.reset();return;}
        if(betterAuth&&recover){await accountRequest('/api/auth/request-password-reset',{email:data.get('email'),redirectTo:window.location.origin+'/?account=reset'});setMessage('If an account exists for this email, a reset link will arrive shortly.');return;}
        await accountRequest(betterAuth?`/api/auth/${register?'sign-up':'sign-in'}/email`:`/api/account/${register?'register':'login'}`,{email:data.get('email'),password:data.get('password'),...(betterAuth?{name:data.get('name')||undefined,callbackURL:window.location.origin+'/?account=return'}:{})});
        form.reset();accountChanged();await reload();if(betterAuth&&register){setRegister(false);setMessage('Check your email to verify your account, then sign in.');}
      });}}>
        {betterAuth&&register&&!recover&&!resetToken&&<label>Name<input name="name" autoComplete="name" required maxLength={100}/></label>}
        {!resetToken&&<label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>}
        {(!recover||!!resetToken)&&<label>{resetToken?'New password':'Password'}<input name="password" type="password" autoComplete={register||resetToken?'new-password':'current-password'} required minLength={12} maxLength={128}/></label>}
        <small>{betterAuth?'Verify your email before signing in. Use a password of 12–128 characters.':'Use 12–128 characters. Test accounts do not yet offer email verification or password recovery.'}</small>
        <div className="membership-actions"><button disabled={busy} type="submit">{resetToken?'Save new password':recover?'Send reset link':register?(betterAuth?'Create account':'Create test account'):'Sign in'}</button><button type="button" disabled={busy} onClick={()=>{if(recover||resetToken){setRecover(false);setResetToken('');setRegister(false);}else setRegister(!register);}}>{recover||resetToken?'Back to sign in':register?'Already registered?':'Create an account'}</button>
        {betterAuth&&!register&&!recover&&!resetToken&&<><button type="button" disabled={busy} onClick={()=>setRecover(true)}>Forgot password?</button><button type="button" disabled={busy} onClick={e=>{const form=e.currentTarget.closest('form');if(!form)return;const email=form.querySelector<HTMLInputElement>('input[name="email"]');if(!email?.reportValidity())return;void perform(async()=>{await accountRequest('/api/auth/send-verification-email',{email:email.value,callbackURL:window.location.origin+'/?account=return'});setMessage('If verification is needed, an email will arrive shortly.');});}}>Resend verification email</button></>}
        </div>
      </form>:<><p>{account.user.email} · <strong>{account.user.premium?(account.mode==='live'?'Premium':'Premium · test'):'Free'}</strong></p>
        <div className="membership-actions"><button disabled={busy||!account.billingReady} onClick={()=>void perform(()=>billing('/api/billing/checkout'))}>{account.mode==='live'?'Upgrade to Premium':'Test premium checkout'}</button><button disabled={busy||!account.billingReady} onClick={()=>void perform(()=>billing('/api/billing/portal'))}>Manage subscription</button><button disabled={busy} onClick={()=>void perform(reload)}>Refresh subscription</button><button disabled={busy} onClick={()=>void perform(async()=>{await disconnectAccountNotifications();await accountRequest(betterAuth?'/api/auth/sign-out':'/api/account/logout',{});accountChanged(true);await reload();})}>Sign out</button></div>
        {!account.billingReady&&<p>Checkout setup is pending. No payment can be taken yet.</p>}
        {account.usage&&<p>Monthly {account.mode==='test'?'test ':''}lookups: {account.usage.requests} / {account.usage.limit}. {account.mode==='test'?'No provider spend in test mode.':'Provider requests count conservatively toward service limits.'} Background checks run only for journeys enabled in Premium tools.</p>}
        {account.user.premium&&<p><a href="/airport-simulation/">Play airport simulator →</a></p>}
        <Suspense fallback={<p role="status">Loading saved journeys…</p>}><AccountWorkspace account={account} openJourney={openJourney}/></Suspense>
      </>}
    </>}
    {message&&<p role="status">{message}</p>}
  </section>;
}

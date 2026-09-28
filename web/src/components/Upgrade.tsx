import {PremiumPreview} from './PremiumPreview';
import {lazy,Suspense,useRef,useState,useEffect} from 'react';
const MembershipPanel=lazy(()=>import('./MembershipPanel').then(m=>({default:m.MembershipPanel})));
import {Sparkles, X} from 'lucide-react';

export function Upgrade({openJourney}:{openJourney:(hex:string)=>Promise<void>}) {
  const [open,setOpen]=useState(false);
  const [accountOnly,setAccountOnly]=useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => dialog.current?.close();
  const show=(account=false)=>{setAccountOnly(account);setOpen(true);dialog.current?.showModal();};
  useEffect(()=>{const account=()=>show(true);window.addEventListener('skyward-account',account);if(new URLSearchParams(location.search).has('account')){show(new URLSearchParams(location.search).get('account')!=='upgrade');const url=new URL(location.href);url.searchParams.delete('account');history.replaceState(null,'',url);}return()=>window.removeEventListener('skyward-account',account);},[]);
  return <>
    <button ref={trigger} className="upgrade-trigger" aria-haspopup="dialog" onClick={() => show()}><Sparkles size={14}/>Upgrade</button>
    <button className="account-trigger quiet-button" onClick={()=>show(true)} aria-haspopup="dialog">Account &amp; journeys</button>
    <dialog ref={dialog} className="upgrade-dialog" aria-labelledby="upgrade-title" aria-describedby="upgrade-description" onClose={() => {setOpen(false);trigger.current?.focus();}} onClick={e => {if(e.target === e.currentTarget) close();}}>
      <div className="upgrade-heading"><span>SKYWARD PREMIUM · COMING SOON</span><button className="icon-button" aria-label="Close upgrade details" onClick={close}><X size={20}/></button></div>
      <h2 id="upgrade-title">{accountOnly?'Your Skyward':'See more of every journey.'}</h2>
      <p id="upgrade-description">Go beyond the globe with richer flight details.</p>
      {!accountOnly&&<div className="upgrade-plans">
        <section><h3>Free</h3><p>Your current experience</p><ul><li>Interactive globe and aircraft tracking</li><li>3D flight views</li><li>Existing free-feed observations</li><li>Account watchlist syncing</li></ul></section>
        <section className="upgrade-premium"><h3>Premium</h3><p>Everything in Free, plus planned access to:</p><ul><li>Scheduled departure and arrival times</li><li>Gate and terminal details</li><li>Updated arrival estimates and flight status</li><li>Flight-change inbox after verified checks</li><li>Cloud replays and saved viewing setups</li><li>Personal flight logbook and shareable cards</li><li>Airport simulator and cloud career saves</li></ul><small>On-demand flight details with usage limits. Availability varies by flight.</small></section>
      </div>}
      {!accountOnly&&<PremiumPreview/>}<p className="upgrade-availability">Public subscriptions are coming soon. Test checkout is available only when configured; no real payment is taken.</p>
      <p className="upgrade-privacy">Passenger names and actual onboard counts are not included.</p>
      {open&&<Suspense fallback={<p role="status">Loading account…</p>}><MembershipPanel openJourney={async hex=>{await openJourney(hex);close();}}/></Suspense>}
      <button className="upgrade-return" onClick={close}>Keep exploring for free</button>
    </dialog>
  </>;
}

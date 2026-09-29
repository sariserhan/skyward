import {installSessionHealth} from './lib/sessionHealth';
import './lib/installPrompt';
import {lazy,Suspense} from 'react';
import { createRoot } from 'react-dom/client';
const App=lazy(()=>import('./App'));
const AccountPage=lazy(()=>import('./components/AccountPage').then(m=>({default:m.AccountPage})));
import {loadGlobeEngine} from './lib/loadGlobeEngine';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
const FlightSimulator=lazy(()=>import('./components/FlightSimulator').then(m=>({default:m.FlightSimulator})));
installSessionHealth();
async function start(){
 const account=location.pathname==='/account/';
 if(!account)await loadGlobeEngine();
 createRoot(document.getElementById('root')!).render(<ErrorBoundary><Suspense fallback={<main className="entry-loading" role="status">Loading {account?'your account':location.pathname.startsWith('/flight-simulator')?'flight simulator':'observatory'}…</main>}>{account?<AccountPage/>:location.pathname.startsWith('/flight-simulator')?<FlightSimulator/>:<App/>}</Suspense></ErrorBoundary>);
}
void start().catch(()=>{const message=document.getElementById('startup-message');if(message)message.textContent='The 3D engine could not load. Check your connection and reload.';});

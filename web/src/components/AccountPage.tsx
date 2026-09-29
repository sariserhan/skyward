import {MembershipPanel} from './MembershipPanel';
export function AccountPage(){return <main className="account-page"><nav><a href="/">← Back to globe</a><a href="/premium/">Premium</a></nav><h1>Your Skyward account</h1><p>Manage your sign-in, saved flights and journeys.</p><MembershipPanel openJourney={async hex=>{location.assign('/#aircraft='+encodeURIComponent(hex));}}/></main>;}

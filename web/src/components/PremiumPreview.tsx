import {useState} from 'react';
const features=[
 ['Observed aircraft positions and 3D views','Included where covered','Same observed map coverage'],
 ['Fictional Skyward airport activity and journeys','Included · clearly simulated','Included'],
 ['Schedule and arrival estimates','Basic received route hints','On-demand lookup · when available'],
 ['Gate and terminal','Not included','When the flight detail response includes them'],
 ['Flight status and change checks','Local observation alerts','Verified detail checks within plan limits'],
 ['Session recording and flight-moment capture','Replay and export existing recordings','Create new recordings'],
 ['Watchlists and saved journeys','Device-only watches','Account saving and cross-device sync'],
 ['Simulator and account extras','Preview / development access','With active Premium access'],
 ['Family tracking and private links','Not included','Saved flight groups and expiring links'],
 ['Flight passport','Not included','Personal route globe and annual recap'],
 ['Cinematic replay','Not included','Local recording, highlights and video export'],
 ['Spotter alerts and watch rooms','Not included','Observation-based rules and private shared viewing'],
 ['Passenger names / actual onboard counts','Unavailable','Unavailable'],
];
export function PremiumPreview(){const [show,setShow]=useState(false);return <section className="premium-preview" aria-label="Premium feature preview"><details className="premium-comparison"><summary>Compare Free and Premium</summary><div className="comparison-scroll"><table><caption>What an upgrade adds</caption><thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Premium</th></tr></thead><tbody>{features.map(([name,free,paid])=><tr key={name}><th scope="row">{name}</th><td>{free}</td><td>{paid}</td></tr>)}</tbody></table></div><p>Before purchase: check the plan’s lookup limits and price in checkout. Additional details depend on each flight; empty fields remain unavailable. Upgrading does not guarantee faster positions, complete global coverage or actual gate movements.</p><p>Public subscriptions are coming soon. Any configured checkout currently uses test mode. No live availability is inferred from the sample below.</p></details><button className="primary-button" aria-expanded={show} onClick={()=>setShow(!show)}>{show?'Hide premium example':'Preview premium features'}</button>{show&&<><h3>A clearer picture of your journey</h3><p className="sample-badge">Illustrative example · DEMO101 · not live flight data</p><dl><div><dt>Departure</dt><dd>Scheduled 14:20 · estimated 14:35</dd></div><div><dt>Airport details</dt><dd>Terminal 2 · gate unavailable in this example</dd></div><div><dt>Arrival</dt><dd>Estimated 17:05 · 15 minutes later</dd></div><div><dt>Airport simulator</dt><dd>Included with Premium access</dd></div></dl><p>Premium adds authorized schedule, gate, terminal and flight-status details when available, plus the simulators. Missing fields stay unavailable.</p><p>No purchase or paid lookup is made by opening this example.</p></>}</section>;}

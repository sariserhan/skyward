export function SimulatedFlightUpgrade(){
 return <aside className="simulated-flight-upgrade" aria-label="Simulated flight Premium upgrade"><div><strong>Watching a Skyward simulation</strong><span>Get richer flight details with Premium.</span></div><button aria-haspopup="dialog" onClick={()=>window.dispatchEvent(new Event('skyward-upgrade'))}>Upgrade to Premium</button></aside>;
}

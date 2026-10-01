import {useLayoutEffect,useRef,useState} from 'react';
const steps=[
 ['Their journey. Your window to the sky.','Watch real aircraft on the globe. Follow a flight you are waiting for, see where it is, and explore the journey from takeoff to arrival.'],
 ['Waiting for someone? Start with their flight.','Search a flight callsign or choose an aircraft on the map. Check its latest position, available route and arrival estimate. Departure and arrival details depend on the received data; use the airline for confirmed times.'],
 ['See the world along their route','Open Flight view for a passenger window, cockpit, side or bird’s-eye view. Explore nearby places and available weather. These are rendered scenes—not a camera aboard the real aircraft.'],
 ['Keep the flights you care about close','Save an aircraft to find it again, discover special aircraft worldwide, or share a view with someone. Coverage varies; predicted movement and Skyward demo aircraft are labeled.'],
] as const;
export function WelcomeGuide({close,findFlight}:{close:()=>void;findFlight:()=>void}){
 const [step,setStep]=useState(0),panel=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const footer=document.querySelector('.footer-toolbar');if(!footer)return;
  const position=()=>panel.current?.style.setProperty('--welcome-bottom',`${Math.max(12,innerHeight-footer.getBoundingClientRect().top+12)}px`);
  const observer=new ResizeObserver(position);observer.observe(footer);window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true,capture:true});position();
  return()=>{observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[]);
 return <aside ref={panel} className="welcome-guide" aria-label="Getting started"><div><small>GETTING STARTED · {step+1} / {steps.length}</small><button onClick={close} aria-label="Dismiss introduction">×</button></div><section aria-live="polite"><h2>{steps[step][0]}</h2><p>{steps[step][1]}</p></section>{step===0&&<p className="welcome-benefits">Live positions · Routes &amp; arrival estimates · Weather &amp; 3D views</p>}{step===0&&<button className="primary-button welcome-find" onClick={()=>{close();findFlight();}}>Find a flight →</button>}<div><button onClick={close}>Explore globe</button>{step>0&&<button onClick={()=>setStep(s=>s-1)}>Back</button>}<button className="primary-button" onClick={()=>step===steps.length-1?close():setStep(s=>s+1)}>{step===steps.length-1?'Start exploring':'Next'}</button></div></aside>;
}

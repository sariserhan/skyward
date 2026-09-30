import {useLayoutEffect,useRef,useState} from 'react';
const steps=[
 ['Explore the globe','Drag with one finger to rotate. Pinch with two fingers to zoom. Reset view brings you back to Earth.'],
 ['Find a flight','Select a plane on the map, or use Search to find a received flight or an airport. Its details appear below the map.'],
 ['Choose your viewpoint','After selecting a flight, open Flight view for side, pilot, cabin and bird views. Map tools contains layers, sky objects and camera controls.'],
] as const;
export function WelcomeGuide({close}:{close:()=>void}){
 const [step,setStep]=useState(0),panel=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const footer=document.querySelector('.footer-toolbar');if(!footer)return;
  const position=()=>panel.current?.style.setProperty('--welcome-bottom',`${Math.max(12,innerHeight-footer.getBoundingClientRect().top+12)}px`);
  const observer=new ResizeObserver(position);observer.observe(footer);window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true,capture:true});position();
  return()=>{observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);};
 },[]);
 return <aside ref={panel} className="welcome-guide" aria-label="Getting started"><div><small>GETTING STARTED · {step+1} / {steps.length}</small><button onClick={close} aria-label="Dismiss introduction">×</button></div><section aria-live="polite"><h2>{steps[step][0]}</h2><p>{steps[step][1]}</p></section><div><button onClick={close}>Skip</button>{step>0&&<button onClick={()=>setStep(s=>s-1)}>Back</button>}<button className="primary-button" onClick={()=>step===steps.length-1?close():setStep(s=>s+1)}>{step===steps.length-1?'Start exploring':'Next'}</button></div></aside>;
}

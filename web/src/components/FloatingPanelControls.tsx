import {useEffect,useRef,useState} from 'react';

type Position={x:number;y:number;width:number};
let savedPosition:Position|null=null;
/** Keeps flight content mounted while moving or minimizing its panel. */
export function FloatingPanelControls({title}:{title:string}){
 const bar=useRef<HTMLDivElement>(null),position=useRef<Position|null>(savedPosition);
 const drag=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
 const [minimized,setMinimized]=useState(false),[moved,setMoved]=useState(!!savedPosition);
 const panel=()=>bar.current?.parentElement;
 const place=(next:Position)=>{
  const el=panel(),parent=el?.offsetParent;if(!el||!(parent instanceof HTMLElement))return;
  const width=Math.max(0,Math.min(next.width,parent.clientWidth-16));
  const height=Math.min(el.offsetHeight,parent.clientHeight-16);
  const x=Math.max(8,Math.min(next.x,parent.clientWidth-width-8));
  const y=Math.max(8,Math.min(next.y,parent.clientHeight-height-8));
  position.current={x,y,width};savedPosition=position.current;
  for(const [key,value] of Object.entries({left:`${x}px`,top:`${y}px`,right:'auto',bottom:'auto',width:`${width}px`,'max-height':`${Math.max(48,parent.clientHeight-16)}px`}))el.style.setProperty(key,value,'important');
  el.dispatchEvent(new Event('panelpositionchange'));setMoved(true);
 };
 const reset=()=>{const el=panel();position.current=null;savedPosition=null;setMoved(false);for(const key of ['left','top','right','bottom','width','max-height'])el?.style.removeProperty(key);el?.dispatchEvent(new Event('panelpositionchange'));};
 useEffect(()=>{
  const el=panel();if(!el)return;
  const fit=()=>{if(position.current)place(position.current);};
  const observer=new ResizeObserver(fit);observer.observe(el);if(el.parentElement)observer.observe(el.parentElement);fit();
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{const el=panel();if(!el)return;el.classList.toggle('panel-minimized',minimized);el.scrollTop=0;if(position.current)place(position.current);el.dispatchEvent(new Event('panelpositionchange'));},[minimized]);
 return <div className="floating-panel-controls" ref={bar}>
  <button className="panel-drag-handle" aria-label="Move flight panel" title="Drag to move. Arrow keys move; Home resets position."
   onPointerDown={e=>{if(e.button!==0)return;const el=panel(),parent=el?.offsetParent;if(!el||!(parent instanceof HTMLElement))return;const r=el.getBoundingClientRect(),p=parent.getBoundingClientRect();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left-p.left,top:r.top-p.top};position.current={x:r.left-p.left,y:r.top-p.top,width:r.width};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId||!position.current)return;place({...position.current,x:d.left+e.clientX-d.x,y:d.top+e.clientY-d.y});}}
   onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
   onKeyDown={e=>{if(e.key==='Home'){e.preventDefault();reset();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const el=panel(),parent=el?.offsetParent;if(!el||!(parent instanceof HTMLElement))return;const r=el.getBoundingClientRect(),p=parent.getBoundingClientRect(),step=e.shiftKey?40:10;place({x:r.left-p.left+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:r.top-p.top+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0),width:r.width});}}
  ><span aria-hidden="true">⠿</span><span>{minimized?title:'Move panel'}</span></button>
  {moved&&<button onClick={reset} aria-label="Reset flight panel position" title="Reset position">↺</button>}
  <button aria-label={minimized?'Restore flight panel':'Minimize flight panel'} aria-expanded={!minimized} onClick={()=>setMinimized(v=>!v)} title={minimized?'Restore panel':'Minimize panel'}>{minimized?'＋':'−'}</button>
 </div>;
}

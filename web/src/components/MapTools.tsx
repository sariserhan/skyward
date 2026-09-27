import {useEffect,useRef,useId,type ReactNode,type ButtonHTMLAttributes} from 'react';
export function MapTools({children,host}:{children:ReactNode;host:(el:HTMLDivElement|null)=>void}){
 const root=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node)&&!(e.target as HTMLElement).closest('dialog'))root.current.open=false;};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&root.current?.open&&!document.querySelector('dialog[open]')){root.current.open=false;root.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[]);
 return <details ref={root} className="unified-map-tools"><summary>Map tools</summary><div className="map-tools-content" aria-label="Map tools menu">{children}<div ref={host} className="map-tools-utilities"/></div></details>;
}

export function MapToolAction({description,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{description:string}){
 const helpId=useId();
 return <div className="map-tool-row"><button {...props} aria-describedby={helpId}>{children}</button><small id={helpId}>{description}</small></div>;
}

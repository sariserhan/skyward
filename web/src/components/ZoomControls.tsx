import './zoom-controls.css';
export function ZoomControls({label,onZoomIn,onZoomOut,disableIn=false,disableOut=false}:{label:string;onZoomIn:()=>void;onZoomOut:()=>void;disableIn?:boolean;disableOut?:boolean}){
 return <div className="camera-zoom-controls" role="group" aria-label={`${label} zoom controls`}><button type="button" aria-label={`Zoom in ${label.toLowerCase()}`} title="Zoom in" disabled={disableIn} onClick={onZoomIn}>+</button><button type="button" aria-label={`Zoom out ${label.toLowerCase()}`} title="Zoom out" disabled={disableOut} onClick={onZoomOut}>−</button></div>;
}

import {systemMessage} from '../lib/systemState';
export function ErrorScreen({status='error',reload=()=>location.reload()}:{status?:number|'error';reload?:()=>void}){
 const m=systemMessage(status);
 return <main className="system-screen"><section className="system-card" role="alert"><a className="system-brand" href="/">SKYWARD</a><div className="system-orbit" aria-hidden="true"/><small className="system-code">{m.code}</small><h1>{m.title}</h1><p>{m.description}</p><nav aria-label="Recovery actions">{status!==404&&<button className="primary-button" onClick={reload}>Reload {status==='error'?'observatory':'page'}</button>}<a className={status===404?'system-primary':''} href="/">Back to globe</a><a href="/account/">Your account</a></nav></section></main>;
}
export function LoadingSkeleton({label='Loading…',rows=3}:{label?:string;rows?:number}){
 return <div className="loading-skeleton" role="status" aria-live="polite" aria-busy="true"><span>{label}</span><div aria-hidden="true"><div className="skeleton-line skeleton-title"/>{Array.from({length:rows},(_,i)=><div className="skeleton-card" key={i}><i className="skeleton-line"/><i className="skeleton-line short"/></div>)}</div></div>;
}
export function LoadingScreen({label='Opening the observatory…'}:{label?:string}){
 return <main className="system-screen"><section className="system-card"><a className="system-brand" href="/">SKYWARD</a><div className="system-orbit" aria-hidden="true"/><h1>Preparing your view</h1><LoadingSkeleton label={label}/><p>Loading the view and its controls.</p><a href="/">Back to globe</a></section></main>;
}

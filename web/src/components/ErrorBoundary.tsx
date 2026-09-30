import {Component,type ReactNode} from 'react';
import {ErrorScreen} from './SystemState';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean;backgroundError:boolean}>{
 state={failed:false,backgroundError:false};
 static getDerivedStateFromError(){return {failed:true};}
 // Event handlers and background tasks can fail without invalidating React's
 // rendered tree. Keep the globe mounted so its own recovery can finish.
 private onError=(event:ErrorEvent)=>{if(event.error||event.message)this.reportBackgroundError();};
 private onRejection=(event:PromiseRejectionEvent)=>{if(event.reason?.name!=='AbortError')this.reportBackgroundError();};
 private reportBackgroundError=()=>{if(!this.state.backgroundError&&!this.state.failed)this.setState({backgroundError:true});};
 componentDidMount(){window.addEventListener('error',this.onError);window.addEventListener('unhandledrejection',this.onRejection);}
 componentWillUnmount(){window.removeEventListener('error',this.onError);window.removeEventListener('unhandledrejection',this.onRejection);}
 render(){return this.state.failed?<ErrorScreen/>:<>{this.props.children}{this.state.backgroundError&&<aside className="background-error-notice" role="alert" aria-label="Background error"><p>Something could not finish. You can keep exploring; reload if a control stops responding.</p><div><button onClick={()=>location.reload()}>Reload</button><button onClick={()=>this.setState({backgroundError:false})}>Dismiss</button></div></aside>}</>;}
}

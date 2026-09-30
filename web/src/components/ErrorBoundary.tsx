import {Component,type ReactNode} from 'react';
import {ErrorScreen} from './SystemState';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 // Resource failures are handled by their owning view. Only uncaught script errors
 // and unhandled promises reach global recovery; normal API errors remain local.
 private onError=(event:ErrorEvent)=>{if(event.error||event.message)this.fail();};
 private onRejection=(event:PromiseRejectionEvent)=>{if(event.reason?.name!=='AbortError')this.fail();};
 private fail=()=>{if(!this.state.failed)this.setState({failed:true});};
 componentDidMount(){window.addEventListener('error',this.onError);window.addEventListener('unhandledrejection',this.onRejection);}
 componentWillUnmount(){window.removeEventListener('error',this.onError);window.removeEventListener('unhandledrejection',this.onRejection);}
 render(){return this.state.failed?<ErrorScreen/>:this.props.children;}
}

import {Component,type ReactNode} from 'react';
/** Keep an optional sky-tool failure local; aircraft and the rest of the map survive. */
export class SkyBoundary extends Component<{children:ReactNode},{error:string|null}>{
 state:{error:string|null}={error:null};
 static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error.message.slice(0,300):'Sky view could not load.'};}
 render(){return this.state.error?<aside className="sky-focus-note" role="alert"><strong>Sky view unavailable</strong><span>The aircraft map is still available.</span><button onClick={()=>this.setState({error:null})}>Retry sky tools</button><details><summary>Error details</summary><small>{this.state.error}</small></details></aside>:this.props.children;}
}

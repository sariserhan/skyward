import {Component,type ReactNode} from 'react';
import {cockpitFailure} from '../lib/sessionHealth';

/** Keep a cockpit render/effect failure inside the optional view, preserving the globe. */
export class CockpitBoundary extends Component<{children:ReactNode;onExit:()=>void},{failed:boolean;attempt:number}>{
 state={failed:false,attempt:0};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){cockpitFailure();}
 render(){
  if(this.state.failed)return <section className="cockpit-recovery" role="alert" aria-label="Cockpit recovery"><h2>Pilot view could not open.</h2><p>Your flight and globe are still available. Return to side view or try the cockpit again.</p><div><button onClick={this.props.onExit}>Return to side view</button><button onClick={()=>this.setState(s=>({failed:false,attempt:s.attempt+1}))}>Retry pilot view</button></div></section>;
  return <div key={this.state.attempt} className="cockpit-boundary">{this.props.children}</div>;
 }
}

import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if(this.state.failed) return <main className="recovery-screen"><h1>Let’s reconnect to the sky.</h1><p>The observatory encountered an unexpected problem. Reload to start a fresh session; your saved aircraft stay on this device.</p><button className="primary-button" onClick={()=>location.reload()}>Reload observatory</button></main>;
    return this.props.children;
  }
}

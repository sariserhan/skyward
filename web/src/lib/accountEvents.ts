export const accountChanged=(signedOut=false)=>window.dispatchEvent(new CustomEvent('skyward-account-changed',{detail:{signedOut}}));

export interface InstallEvent extends Event{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>;}
let available:InstallEvent|null=null;
export const currentInstallPrompt=()=>available;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();available=e as InstallEvent;dispatchEvent(new Event('skyward-install-ready'));});
export function clearInstallPrompt(){available=null;}

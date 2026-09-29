let pending:Promise<void>|undefined;
/** The account entry never downloads the WebGL engine or its styles. */
export function loadGlobeEngine(){
 if(window.Cesium)return Promise.resolve();
 return pending??=new Promise<void>((resolve,reject)=>{
  Object.assign(window,{CESIUM_BASE_URL:'/watch/cesium/'});
  const css=document.createElement('link');css.rel='stylesheet';css.href='/watch/cesium/Widgets/widgets.css';document.head.append(css);
  const script=document.createElement('script');script.src='/watch/cesium/Cesium.js';script.async=true;
  script.onload=()=>window.Cesium?resolve():reject(new Error('3D engine unavailable'));
  script.onerror=()=>reject(new Error('3D engine download failed'));document.head.append(script);
 });
}

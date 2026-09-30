let pending:Promise<void>|undefined;
/** The account entry never downloads the WebGL engine or its styles. */
export function loadGlobeEngine(){
 if(window.Cesium)return Promise.resolve();
 return pending??=new Promise<void>((resolve,reject)=>{
  Object.assign(window,{CESIUM_BASE_URL:'/watch/cesium/'});
  const css=document.createElement('link');css.rel='stylesheet';css.href='/watch/cesium/Widgets/widgets.css';document.head.append(css);
  const script=document.createElement('script');script.src='/watch/cesium/Cesium.js';script.async=true;
  script.onload=()=>{if(!window.Cesium){reject(new Error('3D engine unavailable'));return;}
   // No ion services are used. Remove only its default logo, preserving source credits.
   window.Cesium.CreditDisplay.cesiumCredit=new window.Cesium.Credit('');
   resolve();
  };
  script.onerror=()=>reject(new Error('3D engine download failed'));document.head.append(script);
 });
}

// Preserve shared interactive cameras when a callsign acquires a reference page.
(()=>{
 function restore(){
  const scene=new URLSearchParams(location.hash.slice(1));
  if((scene.get('scene')==='flight'||scene.has('camera'))&&/^\/flights\/[A-Z0-9]{2,10}\/$/.test(location.pathname)){
   const url=new URL(location.href);url.searchParams.set('live','1');location.replace(url.href);
  }
 }
 window.addEventListener('hashchange',restore);restore();
})();

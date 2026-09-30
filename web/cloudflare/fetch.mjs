// Workers implements manual/follow redirect modes. Preserve the Node handlers'
// redirect:error contract without forwarding credentials to a redirect target.
export function createWorkerFetch(fetchImpl=(...args)=>fetch(...args)){
 return async(input,options={})=>{
  const rejectRedirect=(options.redirect??(input instanceof Request?input.redirect:undefined))==='error';
  const response=await fetchImpl(input,rejectRedirect?{...options,redirect:'manual'}:options);
  if(rejectRedirect&&[301,302,303,307,308].includes(response.status)){
   await response.body?.cancel();throw new TypeError('Upstream redirect rejected');
  }
  return response;
 };
}
export const workerFetch=createWorkerFetch();

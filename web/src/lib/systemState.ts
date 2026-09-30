export function systemMessage(status:number|'error'){
 if(status===404)return {code:'404',title:'Page not found',description:'This page may have moved, or the link may no longer be available.'};
 if(status===403)return {code:'403',title:'This page is not available',description:'You do not have access to this page. Return to the globe or check your account.'};
 if(status==='error')return {code:'APPLICATION ERROR',title:'Let’s reconnect to the sky.',description:'Skyward encountered an unexpected problem. Reload to try again. Your saved trips and settings are not cleared.'};
 return {code:String(status),title:'Something went wrong',description:'Skyward could not complete this request. Try again in a moment, or return to the globe.'};
}

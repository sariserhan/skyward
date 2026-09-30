import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
/** Small bridge for our existing JSON/HTML account handlers. Auth uses fetch natively. */
export async function nodeHandler(request,handle){
 const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>65536)return Response.json({error:'Request too large'},{status:413});
 const req=Readable.from(bytes.length?[Buffer.from(bytes)]:[]);req.url=new URL(request.url).pathname+new URL(request.url).search;req.method=request.method;req.headers=Object.fromEntries(request.headers);req.socket={remoteAddress:request.headers.get('cf-connecting-ip')||'unknown'};
 let status=200,result=null;const headers=new Headers(),res=new EventEmitter();
 res.setHeader=(key,value)=>{headers.delete(key);for(const v of Array.isArray(value)?value:[value])headers.append(key,String(v));};res.getHeader=key=>headers.get(key);res.removeHeader=key=>headers.delete(key);
 res.writeHead=(code,values={})=>{status=code;for(const [k,v] of Object.entries(values))res.setHeader(k,v);res.headersSent=true;};
 res.end=body=>{result=new Response(request.method==='HEAD'?null:body??null,{status,headers});res.emit('finish');};
 const handled=await handle(req,res,new URL(request.url));return handled?result:null;
}

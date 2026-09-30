import {parseBoardingPass,type BoardingPassDraft} from './boardingPass';
import {BrowserMultiFormatReader} from '@zxing/browser';
import {BarcodeFormat,DecodeHintType} from '@zxing/library';
const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.PDF_417,BarcodeFormat.AZTEC,BarcodeFormat.DATA_MATRIX,BarcodeFormat.QR_CODE]]]);
function reader(){const r=new BrowserMultiFormatReader(hints);r.hints.set(DecodeHintType.TRY_HARDER,true);return r;}
export function decodeBoardingCanvas(canvas:HTMLCanvasElement,year:number){return parseBoardingPass(reader().decodeFromCanvas(canvas).getText(),year);}
export async function scanBoardingFile(file:File,year:number,signal:AbortSignal):Promise<BoardingPassDraft[]>{
 if(file.size>10*1024*1024)throw Error('Choose an image or PDF up to 10 MB.');
 if(signal.aborted)throw Error('Scan cancelled.');
 if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
  const pdf=await import('pdfjs-dist'),worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');pdf.GlobalWorkerOptions.workerSrc=worker.default;
  const task=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),enableXfa:false,useSystemFonts:false,disableFontFace:true,maxImageSize:16000000});
  const abort=()=>void task.destroy();signal.addEventListener('abort',abort,{once:true});
  try{const doc=await task.promise;if(doc.numPages>10)throw Error('Choose a PDF of 10 pages or fewer.');const rows:BoardingPassDraft[]=[];
   for(let n=1;n<=doc.numPages;n++){if(signal.aborted)throw Error('Scan cancelled.');const page=await doc.getPage(n),base=page.getViewport({scale:1}),scale=Math.min(3,2400/Math.max(base.width,base.height)),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    try{await page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport}).promise;try{rows.push(...decodeBoardingCanvas(canvas,year));}catch{}}finally{canvas.width=canvas.height=0;page.cleanup();}
   }
   if(!rows.length)throw Error('No readable boarding-pass barcode found in this PDF. Try a close-up image or manual entry.');return rows.filter((r,i)=>rows.findIndex(x=>x.flight===r.flight&&x.date===r.date&&x.seat===r.seat&&x.from===r.from)===i);
  }finally{signal.removeEventListener('abort',abort);await task.destroy();}
 }
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPEG, WebP image or PDF. Wallet files are not supported; share a boarding-pass image instead.');
 const bitmap=await createImageBitmap(file);try{if(signal.aborted)throw Error('Scan cancelled.');const canvas=document.createElement('canvas'),scale=Math.min(1,3000/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);try{canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);return decodeBoardingCanvas(canvas,year);}catch{throw Error('No readable boarding-pass barcode found. Crop around the barcode or enter the trip manually.');}finally{canvas.width=canvas.height=0;}}finally{bitmap.close();}
}
export async function startBoardingCamera(video:HTMLVideoElement,year:number,onResult:(rows:BoardingPassDraft[])=>void){
 if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera scanning needs HTTPS or localhost. Upload an image or enter the trip manually.');
 return reader().decodeFromConstraints({video:{facingMode:{ideal:'environment'},width:{ideal:1600}},audio:false},video,(result,_error,controls)=>{if(!result)return;try{const rows=parseBoardingPass(result.getText(),year);controls.stop();onResult(rows);}catch{/* Keep looking; never log barcode content. */}});
}

/** Browser upload progress reports bytes sent only; OCR continues after upload reaches 100%. */
export function uploadSupplierPhoto(file:File,signal:AbortSignal,progress:(percent:number)=>void):Promise<Response>{
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    const abort=()=>request.abort();
    const cleanup=()=>signal.removeEventListener("abort",abort);
    request.open("POST","/api/materials/extract-quote");request.timeout=120_000;
    request.upload.onprogress=event=>{if(event.lengthComputable)progress(Math.round(event.loaded/event.total*100));};
    request.onload=()=>{cleanup();resolve(new Response(request.responseText,{status:request.status,headers:{"Content-Type":request.getResponseHeader("Content-Type")??"application/json"}}));};
    request.onerror=()=>{cleanup();reject(new Error("The upload failed. Your photos are still selected; retry the scan."));};
    request.ontimeout=()=>{cleanup();reject(new Error("The scan timed out. Your photos are still selected; retry the scan."));};
    request.onabort=()=>{cleanup();reject(new DOMException("Scan cancelled. Your photos are still selected.","AbortError"));};
    if(signal.aborted){reject(new DOMException("Scan cancelled.","AbortError"));return;}
    signal.addEventListener("abort",abort,{once:true});const form=new FormData();form.append("image",file);request.send(form);
  });
}

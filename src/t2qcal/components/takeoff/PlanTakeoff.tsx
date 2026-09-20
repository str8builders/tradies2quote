"use client";
import {useEffect,useRef,useState} from "react";
import {Input} from "@/components/ui/input";
import Uppy from "@uppy/core";
import type {PDFDocumentProxy} from "pdfjs-dist";
import {workingDB,type PlanRecord} from "@/t2qcal/lib/local-db";
import {planQuantity,pointDistance,validatePlanSource,type PlanCalibration,type PlanPoint,type PlanSource} from "@/t2qcal/lib/plan-measurement";
import {QuoteTransfer} from "../calculators/QuoteTransfer";
import {sendToCalculator} from "../measure/sendToCalculator";
import {PdfCanvas} from "./PdfCanvas";
type Annotations={version:1;calibrations:Record<string,PlanCalibration>;measurements:PlanSource[]};
const empty=():Annotations=>({version:1,calibrations:{},measurements:[]});
function download(data:Blob,name:string){const url=URL.createObjectURL(data),link=window.document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function PlanTakeoff(){
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[file,setFile]=useState<Blob|null>(null),[fileName,setFileName]=useState(""),[hash,setHash]=useState("");
  const [library,setLibrary]=useState<Array<Pick<PlanRecord,"id"|"name">>>([]),[annotations,setAnnotations]=useState<Annotations>(empty),[dirty,setDirty]=useState(false);
  const [page,setPage]=useState(1),[rotation,setRotation]=useState(0),[zoom,setZoom]=useState(1),[mode,setMode]=useState<PlanSource["kind"]|"calibrate">("calibrate"),[points,setPoints]=useState<PlanPoint[]>([]),[known,setKnown]=useState(""),[label,setLabel]=useState("");
  const [pickerReady,setPickerReady]=useState(false);
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[selected,setSelected]=useState<PlanSource|null>(null);
  const uppy=useRef<Uppy|null>(null),reader=useRef<FileReader|null>(null),generation=useRef(0),documentRef=useRef<PDFDocumentProxy|null>(null),expected=useRef<string|null>(null);
  const pageMeasurements=annotations.measurements.filter(item=>item.page===page),calibration=annotations.calibrations[String(page)];
  async function refreshLibrary(){setLibrary((await workingDB.plans.toArray()).map(({id,name})=>({id,name})));}
  useEffect(()=>{
    uppy.current=new Uppy({id:"t2qcal-plan-file",restrictions:{maxNumberOfFiles:1,maxFileSize:20*1024*1024,allowedFileTypes:[".pdf","application/pdf"]}});
    queueMicrotask(()=>setPickerReady(true));
    void workingDB.plans.toArray().then(rows=>setLibrary(rows.map(({id,name})=>({id,name})))).catch(()=>setError("Device plan storage is unavailable."));
    const lifecycle=generation;
    return()=>{lifecycle.current++;reader.current?.abort();uppy.current?.destroy();void documentRef.current?.loadingTask.destroy();};
  },[]);
  async function open(blob:Blob,name:string){
    const current=++generation.current;setBusy(true);setError("");setNotice("");setProgress("Reading PDF…");
    let task:ReturnType<typeof import("pdfjs-dist")["getDocument"]>|undefined;
    try{
      const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{
        const input=new FileReader();reader.current=input;
        input.onprogress=e=>{if(e.lengthComputable)setProgress(`Reading PDF ${Math.round(e.loaded/e.total*100)}%`);};
        input.onload=()=>resolve(input.result as ArrayBuffer);input.onerror=()=>reject(new Error("The PDF could not be read. Choose it again to retry."));input.onabort=()=>reject(new Error("Opening cancelled."));input.readAsArrayBuffer(blob);
      });
      if(current!==generation.current)return;
      setProgress("Opening PDF pages…");
      const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(byte=>byte.toString(16).padStart(2,"0")).join("");
      const pdfjs=await import("pdfjs-dist");pdfjs.GlobalWorkerOptions.workerSrc="/vendor/pdfjs/6.3.289/pdf.worker.min.mjs";
      task=pdfjs.getDocument({data:new Uint8Array(bytes),cMapUrl:"/vendor/pdfjs/6.3.289/cmaps/",cMapPacked:true,standardFontDataUrl:"/vendor/pdfjs/6.3.289/standard_fonts/",wasmUrl:"/vendor/pdfjs/6.3.289/wasm/"});
      const next=await task.promise;
      if(current!==generation.current){await next.loadingTask.destroy();return;}
      if(next.numPages>500){await next.loadingTask.destroy();throw new Error("Use a PDF with 500 pages or fewer. Split larger drawing sets first.");}
      const stored=await workingDB.plans.get(digest);
      const restored=stored?parseAnnotations(JSON.parse(stored.annotations),digest,next.numPages):empty();
      const previous=documentRef.current;documentRef.current=next;setPdf(next);setFile(blob);setFileName(name.slice(0,180));setHash(digest);setAnnotations(restored);expected.current=stored?.annotations??null;
      setPage(1);setRotation(0);setZoom(1);setPoints([]);setSelected(null);setMode("calibrate");setDirty(!stored);setNotice(stored?"Restored this plan and its measurements from this device.":"PDF opened locally. Calibrate a known dimension, then mark your measurements.");void previous?.loadingTask.destroy();
    }catch(e){if(current===generation.current)setError(e instanceof Error?e.message:"The PDF could not be opened. Choose it again to retry.");void task?.destroy();}
    finally{if(current===generation.current){setBusy(false);setProgress("");}}
  }
  function choose(input:File|undefined){if(!input||busy)return;if(dirty&&!window.confirm("Open another plan? Export or save current measurements first; unsaved changes will be discarded."))return;try{uppy.current?.cancelAll();const id=uppy.current?.addFile({name:input.name,type:input.type,data:input});if(id)void open(input,input.name);}catch(e){setError(e instanceof Error?e.message:"Choose a PDF up to 20 MB.");}}
  function cancel(){generation.current++;reader.current?.abort();setBusy(false);setProgress("");setNotice("Opening cancelled. Choose the PDF again to retry.");}
  function update(next:Annotations){setAnnotations(next);setDirty(true);setError("");setNotice("");}
  function addPoint(point:PlanPoint){const max=["calibrate","length","rectangle"].includes(mode)?2:100;if(points.length>=max){setNotice(`This tool uses ${max} points. Finish or undo before adding another.`);return;}setPoints([...points,point]);setNotice("");}
  function finish(){
    try{
      if(mode==="calibrate"){
        if(points.length!==2||!(Number(known)>0)||Number(known)>10000||pointDistance(points[0],points[1])<.01)throw new Error("Mark two distinct points and enter their known distance in metres.");
        update({...annotations,calibrations:{...annotations.calibrations,[page]:{points:points as [PlanPoint,PlanPoint],metres:Number(known)}}});setMode("length");setPoints([]);setNotice("Page calibrated. Existing measurements keep their original calibration.");return;
      }
      if(annotations.measurements.length>=500)throw new Error("This plan has 500 measurements. Export and start a separate drawing set.");
      const source=validatePlanSource({version:1,fileHash:hash,fileName,page,label:label.trim()||`${mode} ${annotations.measurements.length+1}`,kind:mode,points,...(calibration?{calibration}:{})});
      update({...annotations,measurements:[...annotations.measurements,source]});setPoints([]);setSelected(source);setLabel("");
    }catch(e){setError(e instanceof Error?e.message:"Check the measurement.");}
  }
  async function save(){
    if(!file)return;setBusy(true);setError("");
    try{
      const json=JSON.stringify(annotations);
      await workingDB.transaction("rw",workingDB.plans,async()=>{
        const prior=await workingDB.plans.get(hash);
        if((prior?.annotations??null)!==expected.current)throw new Error("This plan changed in another tab. Export your measurements, then reopen the stored plan before merging them.");
        if(!prior&&await workingDB.plans.count()>=20)throw new Error("This device holds 20 plans. Export and remove an older plan before saving another.");
        await workingDB.plans.put({id:hash,name:fileName,file,annotations:json,updatedAt:new Date().toISOString()});
      });
      expected.current=json;setDirty(false);await refreshLibrary();setNotice("Plan and measurements saved on this device. They are not backed up to your account.");
    }catch(e){setError(e instanceof Error?e.message:"Device storage is full or unavailable. Export the PDF and measurements.");}
    finally{setBusy(false);}
  }
  async function reopen(id:string){if(!id)return;if(dirty&&!window.confirm("Discard unsaved changes and reopen the device copy?"))return;try{const stored=await workingDB.plans.get(id);if(stored)await open(stored.file,stored.name);}catch{setError("The device plan could not be reopened.");}}
  async function restore(input:File|undefined){if(!input||!pdf)return;try{if(input.size>2_000_000)throw new Error("Choose a measurement file smaller than 2 MB.");const data=JSON.parse(await input.text());if(data.fileHash!==hash)throw new Error("This backup belongs to a different PDF. Open its original PDF first.");if(annotations.measurements.length&&!window.confirm("Replace this plan's current measurements with the backup?"))return;update(parseAnnotations(data.annotations,hash,pdf.numPages));setSelected(null);setPoints([]);}catch(e){setError(e instanceof Error?e.message:"This measurement backup could not be restored.");}}
  async function removePlan(){if(!hash||!window.confirm("Remove this plan and its saved measurements from this device? Export both files first. The open working stays available until you leave."))return;try{await workingDB.plans.delete(hash);expected.current=null;setDirty(true);await refreshLibrary();setNotice("Removed the stored plan. The open working is still available to export.");}catch{setError("The plan could not be removed.");}}
  const selectedValue=selected?planQuantity(selected):null;
  return <main className="directory-page plan-takeoff"><section className="page-intro"><div className="eyebrow">T2QCAL · Plan takeoff</div><h1>Measure from a plan</h1><p>Open a PDF, calibrate a known dimension on each page, then mark lengths, areas or counts. Check the drawing revision and printed dimensions before ordering.</p><p>PDFs stay on this device. Save and export them here; account backup covers calculator working separately.</p></section>
    <div className="save-actions"><label className="directory-button">Open PDF (up to 20 MB)<input type="file" accept="application/pdf,.pdf" disabled={busy||!pickerReady} onChange={e=>{choose(e.target.files?.[0]);e.target.value="";}}/></label><label>Device plans<select aria-label="Device plans" value="" disabled={busy} onChange={e=>void reopen(e.target.value)}><option value="">Choose saved plan</option>{library.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{busy&&progress&&<button onClick={cancel}>Cancel opening</button>}</div>
    {progress&&<p role="status">{progress}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {pdf&&<><h2>{fileName}</h2><div className="save-actions"><label>Page<select aria-label="Page" value={page} onChange={e=>{setPage(Number(e.target.value));setPoints([]);setSelected(null);setMode("calibrate");}}>{Array.from({length:pdf.numPages},(_,i)=><option key={i+1}>{i+1}</option>)}</select></label><label>Zoom<select aria-label="Zoom" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Fit width</option><option value={2}>200%</option><option value={3}>300%</option></select></label><button onClick={()=>setRotation((rotation+90)%360)}>Rotate 90°</button><button disabled={busy||!dirty} onClick={()=>void save()}>{dirty?"Save plan on device":"Saved on device"}</button></div>
    <section className="save-working"><h2>Mark measurements</h2><p>{calibration?`Page ${page}: calibrated against ${calibration.metres} m. Recalibrate for details drawn at a different scale.`:`Page ${page} needs calibration for length and area. Counts do not need scale.`}</p><div className="field-grid"><label>Tool<select aria-label="Tool" value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setPoints([]);}}><option value="calibrate">Calibrate scale</option><option value="length">Length (two points)</option><option value="rectangle">Rectangle area (opposite corners)</option><option value="area">Polygon area (trace perimeter)</option><option value="count">Count items</option></select></label>{mode==="calibrate"?<label>Known distance (m)<Input type="number" min="0.001" max="10000" step="any" value={known} onChange={e=>setKnown(e.target.value)}/></label>:<label>Measurement label<Input maxLength={120} placeholder="e.g. Kitchen floor" value={label} onChange={e=>setLabel(e.target.value)}/></label>}</div><p>Tap points on the drawing. At higher zoom, scroll to move around the page.</p><div className="save-actions"><button disabled={!points.length} onClick={()=>setPoints(points.slice(0,-1))}>Undo point</button><button disabled={!points.length} onClick={()=>setPoints([])}>Clear points</button><button className="directory-button" onClick={finish}>{mode==="calibrate"?"Apply calibration":"Finish measurement"}</button><span>{points.length} points marked</span></div><details><summary>Enter a point by coordinate</summary><p>For keyboard use, enter PDF page coordinates. The PDF coordinate origin is normally the bottom-left corner.</p><form className="save-actions" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);addPoint({x:Number(data.get("x")),y:Number(data.get("y"))});}}><label>X<input required name="x" type="number" step="any" min="-100000" max="100000"/></label><label>Y<input required name="y" type="number" step="any" min="-100000" max="100000"/></label><button>Add point</button></form></details></section>
    <PdfCanvas document={pdf} pageNumber={page} rotation={rotation} zoom={zoom} points={points} measurements={pageMeasurements} onPoint={addPoint}/>
    <section className="save-working"><h2>Page {page} measurements</h2>{!pageMeasurements.length&&<p>No completed measurements on this page yet.</p>}{pageMeasurements.map((item,i)=>{const value=planQuantity(item);return <article key={`${i}-${item.label}`}><h3>{item.label}</h3><p>{value.quantity.toLocaleString(undefined,{maximumFractionDigits:4})} {value.unit}</p><button onClick={()=>setSelected(item)}>Use {item.label} in a quote</button></article>;})}<button disabled={!annotations.measurements.length} onClick={()=>{update({...annotations,measurements:annotations.measurements.slice(0,-1)});setSelected(null);}}>Undo last completed measurement</button></section>
    {selected&&selectedValue&&<><p>Selected: {selected.label} · page {selected.page} · {selectedValue.quantity.toFixed(4)} {selectedValue.unit}. The PDF fingerprint, points and calibration travel with the quote working.</p>{selected.kind==="rectangle"&&selected.calibration&&<button className="directory-button" onClick={()=>{const ratio=selected.calibration!.metres/pointDistance(...selected.calibration!.points)*1000;const message=sendToCalculator("concrete-slab",{length:Math.abs(selected.points[1].x-selected.points[0].x)*ratio,width:Math.abs(selected.points[1].y-selected.points[0].y)*ratio},selected.label,selected);if(message)setError(message);}}>Open rectangle in Concrete slab calculator</button>}<QuoteTransfer key={JSON.stringify(selected)} snapshot={{version:1,slug:"plan-takeoff",unit:"metric",values:{quantity:selectedValue.quantity},planSource:selected}}/></>}
    <section className="save-working"><h2>Keep a backup</h2><p>Keep both the original PDF and measurement JSON. To restore, open that PDF and restore its matching JSON. Device storage can be cleared by the browser.</p><div className="save-actions"><button onClick={()=>file&&download(file,fileName)}>Export original PDF</button><button onClick={()=>download(new Blob([JSON.stringify({version:1,fileHash:hash,annotations},null,2)],{type:"application/json"}),`${fileName}.measurements.json`)}>Export measurements</button><label>Restore measurements<input type="file" accept="application/json,.json" onChange={e=>{void restore(e.target.files?.[0]);e.target.value="";}}/></label><button onClick={()=>void removePlan()}>Remove stored plan</button></div></section></>}
  </main>;
}
function parseAnnotations(raw:unknown,hash:string,pages:number):Annotations{
  const data=raw as Annotations;
  if(!data||data.version!==1||!Array.isArray(data.measurements)||data.measurements.length>500||!data.calibrations||typeof data.calibrations!=="object"||Object.keys(data.calibrations).length>500)throw new Error("The stored plan measurements are damaged. Keep an exported copy before replacing them.");
  const measurements=data.measurements.map(validatePlanSource);
  if(measurements.some(item=>item.fileHash!==hash||item.page>pages))throw new Error("Measurements do not match this PDF.");
  const calibrations:Annotations["calibrations"]={};
  for(const [page,calibration] of Object.entries(data.calibrations)){
    const checked=validatePlanSource({version:1,fileHash:hash,fileName:"Calibration",page:Number(page),label:"Calibration",kind:"length",points:calibration.points,calibration});
    if(checked.page>pages)throw new Error("Calibration page does not exist.");calibrations[page]=checked.calibration!;
  }
  return {version:1,calibrations,measurements};
}

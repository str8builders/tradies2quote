"use client";
import {useEffect,useRef,useState} from "react";
import type {PDFDocumentProxy,RenderTask} from "pdfjs-dist";
import type {PlanPoint,PlanSource} from "@/t2qcal/lib/plan-measurement";
export function PdfCanvas({document,pageNumber,rotation,zoom,points,measurements,onPoint}:{document:PDFDocumentProxy;pageNumber:number;rotation:number;zoom:number;points:PlanPoint[];measurements:PlanSource[];onPoint:(point:PlanPoint)=>void}){
  const container=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(320),[error,setError]=useState(""),[ready,setReady]=useState(false);
  const pointHandler=useRef(onPoint);useEffect(()=>{pointHandler.current=onPoint;},[onPoint]);
  const [viewport,setViewport]=useState<ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["getViewport"]>|null>(null);
  useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(240,Math.floor(entry.contentRect.width))));observer.observe(element);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let cancelled=false,task:RenderTask|undefined;
    async function render(){
      setReady(false);setError("");
      try{
        const page=await document.getPage(pageNumber);if(cancelled)return;
        const base=page.getViewport({scale:1,rotation:(page.rotate+rotation)%360}),view=page.getViewport({scale:Math.min(width/base.width*zoom,Math.sqrt(4_000_000/(base.width*base.height)),10000/base.width,10000/base.height),rotation:(page.rotate+rotation)%360});
        const element=canvas.current;if(!element)return;
        const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4_000_000/(view.width*view.height)));
        element.width=Math.ceil(view.width*ratio);element.height=Math.ceil(view.height*ratio);element.style.width=`${view.width}px`;element.style.height=`${view.height}px`;
        const context=element.getContext("2d");if(!context)throw new Error("Canvas is unavailable.");
        task=page.render({canvas:element,canvasContext:context,viewport:view,transform:[ratio,0,0,ratio,0,0]});await task.promise;
        if(!cancelled){setViewport(view);setReady(true);}
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"This PDF page could not be rendered.");}
    }
    void render();return()=>{cancelled=true;task?.cancel();};
  },[document,pageNumber,rotation,zoom,width]);
  useEffect(()=>{
    if(!viewport||!ready||!overlay.current)return;
    let stopped=false,destroy:(()=>void)|undefined;
    async function draw(){
      const Konva=(await import("konva")).default;if(stopped||!overlay.current)return;
      Konva.pixelRatio=1;
      const stage=new Konva.Stage({container:overlay.current,width:viewport!.width,height:viewport!.height});destroy=()=>stage.destroy();
      const layer=new Konva.Layer();stage.add(layer);
      const convert=(p:PlanPoint)=>viewport!.convertToViewportPoint(p.x,p.y);
      const trace=(source:Pick<PlanSource,"points"|"kind">,colour:string)=>{
        let path=source.points;
        if(source.kind==="rectangle"&&path.length===2){const [a,b]=path;path=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];}
        if(source.kind!=="count")layer.add(new Konva.Line({points:path.flatMap(convert),stroke:colour,strokeWidth:2,closed:["rectangle","area"].includes(source.kind),fill:["rectangle","area"].includes(source.kind)?"rgba(255,95,21,0.12)":undefined,listening:false}));
        path.forEach(p=>{const [x,y]=convert(p);layer.add(new Konva.Circle({x,y,radius:5,fill:colour,stroke:"#111",strokeWidth:1,listening:false}));});
      };
      measurements.forEach(source=>trace(source,"#d5ff00"));trace({points,kind:"length"},"#ff5f15");
      // One pointer activation covers mouse, pen and touch. Listening to both
      // tap and its compatibility click can mark two points for one finger tap.
      stage.on("pointerclick",()=>{const p=stage.getPointerPosition();if(p){const [x,y]=viewport!.convertToPdfPoint(p.x,p.y);pointHandler.current({x,y});}});
      layer.draw();
    }
    void draw();return()=>{stopped=true;destroy?.();};
  },[viewport,ready,points,measurements]);
  return <div ref={container} className="plan-canvas-scroll">{!ready&&!error&&<p role="status">Rendering page…</p>}{error&&<p role="alert">{error}</p>}<div className="plan-canvas-surface" style={{width:viewport?.width,height:viewport?.height}}><canvas ref={canvas} aria-label={`Plan page ${pageNumber}`}/><div ref={overlay} className="plan-canvas-overlay" aria-label="Plan measurement canvas" data-testid="plan-canvas" style={{pointerEvents:ready?"auto":"none"}}/></div></div>;
}

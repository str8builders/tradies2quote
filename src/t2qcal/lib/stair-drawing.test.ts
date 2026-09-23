import {it,expect,vi,afterAll} from "vitest";
import {getVerifiedDefinition} from "./verified-calculators";
import {initialCalculatorValues} from "./calculator-inputs";
import {drawDiagram} from "../components/calculators/technicalDrawing";

/** A canvas stand-in that keeps every string painted on the sheet. */
function textRecorder(){
  const painted:string[]=[];
  const target:Record<string,unknown>={canvas:{width:900,height:700},measureText:(t:string)=>({width:String(t).length*6}),createPattern:()=>({setTransform(){}}),createLinearGradient:()=>({addColorStop(){}}),getImageData:()=>({data:new Uint8ClampedArray(4)}),createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),fillText:(t:string)=>{painted.push(String(t));}};
  const ctx=new Proxy(target,{get(obj,key:string){return key in obj?obj[key]:()=>{};},set(obj,key:string,value){obj[key]=value;return true;}}) as unknown as CanvasRenderingContext2D;
  return {ctx,painted};
}
vi.stubGlobal("document",{createElement:()=>({width:0,height:0,getContext:()=>textRecorder().ctx})});
vi.stubGlobal("DOMMatrix",class{translateSelf(){return this;}rotateSelf(){return this;}scaleSelf(){return this;}});
afterAll(()=>vi.unstubAllGlobals());

it("straight-stair sheet prints the stair pitch and the headroom the opening gives", ()=>{
  const def=getVerifiedDefinition("straight-stairs");
  const values=initialCalculatorValues(def.fields,"metric");
  const out=def.compute(values,"metric");
  const v={...values,...out.diagramValues} as Record<string,number>;
  const {ctx,painted}=textRecorder();
  drawDiagram(ctx,900,700,"stairs",v,"mm","Straight stairs");
  const risers=Math.round(v.risers), rise=v.totalRise/risers, run=v.totalRun/(risers-1);
  const pitch=Math.atan2(rise,run)*180/Math.PI;
  const angle=painted.find(t=>/^\d+(\.\d+)?°$/.test(t));
  expect(Number(angle?.replace("°",""))).toBeCloseTo(pitch,1);
  const head=painted.find(t=>t.includes("Headroom"));
  expect(head).toBeDefined();
  const printed=Number(head!.replace(/[^0-9.]/g,""));
  expect(printed).toBeCloseTo(v.openingRun*rise/run-v.floorThickness,0);
});

import {it,expect,vi,afterAll} from 'vitest';
import {getVerifiedDefinition,expectedVerifiedSlugs} from './verified-calculators';
import {initialCalculatorValues} from './calculator-inputs';
import {drawDiagram,detailKind,to3DKind,type DiagramKind} from '../components/calculators/technicalDrawing';
function recorder(){
 let calls=0;
 const target:Record<string,unknown>={canvas:{width:900,height:500},createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:()=>({data:new Uint8ClampedArray(4)}),measureText:(text:string)=>({width:String(text).length*6}),createPattern:()=>({setTransform(){}}),createLinearGradient:()=>({addColorStop(){}})};
 const ctx=new Proxy(target,{get(obj,key:string){if(key in obj)return obj[key];return(...args:unknown[])=>{if(++calls>100000)throw new Error('Unbounded diagram rendering');for(const arg of args)if(typeof arg==='number'&&!Number.isFinite(arg))throw new Error(`Non-finite ${key}`);if((key==='arc'&&Number(args[2])<0)||(key==='ellipse'&&(Number(args[2])<0||Number(args[3])<0)))throw new Error('Negative arc radius');};},set(obj,key:string,value){obj[key]=value;return true;}}) as unknown as CanvasRenderingContext2D;
 return{ctx,get calls(){return calls;}};
}
vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>recorder().ctx})});
vi.stubGlobal('DOMMatrix',class{translateSelf(){return this;}rotateSelf(){return this;}scaleSelf(){return this;}});
afterAll(()=>vi.unstubAllGlobals());
for(const slug of expectedVerifiedSlugs())for(const unit of ['metric','imperial'] as const)it(`${slug} ${unit} sheets render finite geometry`,()=>{
 const def=getVerifiedDefinition(slug),values=initialCalculatorValues(def.fields,unit),output=def.compute(values,unit);
 expect(output.errors).toBeUndefined();
 const sheets=new Set<DiagramKind>([def.diagram,...(def.sheets??[]).map(s=>s.diagram),detailKind(def.diagram),...(def.showsAssembly===false?[]:[to3DKind(def.diagram)])]);
 for(const width of [320,900])for(const kind of sheets){const recording=recorder();drawDiagram(recording.ctx,width,500,kind,{...values,...output.diagramValues},unit==='metric'?'mm':'in',slug);expect(recording.calls).toBeGreaterThan(0);}
});
it('large ruler values have bounded tick marks',()=>{
 const recording=recorder();drawDiagram(recording.ctx,900,500,'rulerpair',{value:1e9},'mm','Length');expect(recording.calls).toBeLessThan(3000);
});

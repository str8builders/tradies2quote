import {describe,it,expect} from 'vitest';
import {tools} from './tools';
import {getVerifiedDefinition} from './verified-calculators';
import {initialCalculatorValues} from './calculator-inputs';
import {validateSnapshot,computeSnapshot,type CalculationSnapshot} from './calculation-record';
import {calculateStairs,calculateConcrete} from './calculations';
import {materialSuggestion,validateHandoff,handoffQuote} from './quote-handoff';
const custom:Record<string,Record<string,number|string>>={
 'common-rafter':{run:3000,angle:30,overhang:450,depth:190,thickness:45,seat:90,wallHeight:2400},
 'straight-stairs':{totalRise:2800,idealRise:175,run:250,width:1000,floorThickness:260,headroom:2000},
 'equal-spacing':{span:3600,width:45,target:450},
 'concrete-slab':{length:6000,width:4000,thickness:100,waste:10,rate:240},
 'tile-layout':{floor:3600,tile:600,joint:3,rowsInput:5,waste:10},
 'arc-circle':{diameter:1200,segmentsInput:12},'pitch-angle':{rise:1000,run:3000},'all-unit-converter':{value:1,from:'m',to:'ft'},
};
function slab():CalculationSnapshot{return {version:1,slug:'concrete-slab',unit:'metric',values:{...custom['concrete-slab']}};}
describe('calculator directory and private snapshots',()=>{
 for(const tool of tools) for(const unit of ['metric','imperial'] as const) it(`${tool.slug} ${unit} has valid default working`,()=>{
   // Custom (legacy-keyed, metric) values exercise the upgrade path; imperial uses the native defaults.
   let values:Record<string,number|string>=unit==="metric"&&custom[tool.slug]?custom[tool.slug]:initialCalculatorValues(getVerifiedDefinition(tool.slug).fields,unit);
   if(tool.slug==="straight-stairs"&&unit==="imperial")values=Object.fromEntries(Object.entries(custom[tool.slug]).map(([key,value])=>[key,Number(value)/25.4]));
   const record={version:1,slug:tool.slug,unit,values};
   expect(validateSnapshot(record)).toMatchObject({slug:tool.slug,unit});
 });
 it('rejects non-finite values and unknown fields',()=>{
   expect(()=>validateSnapshot({...slab(),values:{...slab().values,width:Infinity}})).toThrow();
   expect(()=>validateSnapshot({...slab(),values:{...slab().values,user_id:'someone'}})).toThrow();
 });
 it('rejects out-of-range inputs and reports impossible layouts the way the native app does',()=>{
   expect(()=>validateSnapshot({version:1,slug:'common-rafter',unit:'metric',values:{...custom['common-rafter'],seat:5000}})).toThrow('seat is outside');
   expect(()=>validateSnapshot({version:1,slug:'equal-spacing',unit:'metric',values:{span:2e6,width:45,target:450}})).toThrow('span is outside');
   // Native accepts these and answers with a single "check" row instead of failing.
   const impossible=validateSnapshot({version:1,slug:'equal-spacing',unit:'metric',values:{span:1e6,width:0,target:.001}});
   expect(computeSnapshot(impossible).results.map(r=>r.label)).toEqual(['Check spacing dimensions']);
 });
});
describe('independent quantity checks',()=>{
 it('stair pitch, nosing line, stock and headroom agree',()=>{
   const g=calculateStairs(2800,175,250,260,2000);
   expect(g.risers).toBe(16);expect(g.treads).toBe(15);
   expect(g.stringer).toBeCloseTo(15*Math.sqrt(175**2+250**2),10);
   expect(g.stockGuide).toBeCloseTo(16*Math.sqrt(175**2+250**2),10);
   expect(g.openingRun).toBeCloseTo(2260*250/175,10);
   expect(Math.atan2(15*175,g.totalRun)*180/Math.PI).toBeCloseTo(g.angle,12);
 });
 it('concrete units preserve volume and density',()=>{
   const m=calculateConcrete(6000,4000,100,10,true),i=calculateConcrete(6000/25.4,4000/25.4,100/25.4,10,false);
   expect(m.orderVolume).toBeCloseTo(2.64,12);
   expect(i.orderVolume*0.028316846592).toBeCloseTo(m.orderVolume,12);
   expect(i.weight*0.45359237).toBeCloseTo(m.weight,8);
 });
 it('quote handoff recomputes the quantity and ignores a spoofed total',()=>{
   const input=validateHandoff({snapshot:slab(),mode:'calculated',description:'Concrete',quantity:9999,unit:'fake',unitPrice:200,clientName:'Test',total:1});
   const q=handoffQuote(input,{currency:'NZD',tax_label:'GST',tax_rate:15,default_markup_pct:20},'proof');
   expect(q.line_items[0].quantity).toBeCloseTo(2.64,12);expect(q.line_items[0].unit).toBe('m³');expect(q.materials_subtotal).toBe(528);expect(q.total).toBe(728.64);
   expect(JSON.parse(q.line_items[0].t2qcal_provenance_note!)).toEqual(validateSnapshot(slab()));
 });
 it('geometry without material output requires an explicit user quantity',()=>{
   const snapshot:CalculationSnapshot={version:1,slug:'pitch-angle',unit:'metric',values:{rise:1000,run:3000}};
   expect(materialSuggestion(snapshot)).toBeNull();
   expect(()=>validateHandoff({snapshot,mode:'calculated',description:'Timber',unitPrice:0,clientName:''})).toThrow();
   expect(()=>validateHandoff({snapshot,mode:'manual',description:'Timber',quantity:0,unit:'m',unitPrice:0,clientName:''})).toThrow();
 });
});
it('board-foot volume uses inches regardless of display units',()=>{
 const def=getVerifiedDefinition('board-foot');
 for(const unit of ['metric','imperial'] as const){const output=def.compute(initialCalculatorValues(def.fields,unit),unit);expect(output.results.find(r=>r.label==='Total board feet')?.value).toBe('106.667 bd ft');expect(output.results.find(r=>r.label==='Total price')?.value).toBe('$256');}
});
it('image scale reference changes as a length while pixel distances remain fixed',()=>{
 const def=getVerifiedDefinition('image-scale');expect(def.fields.find(f=>f.key==='known')?.kind).toBe('length');
 const a=def.compute(initialCalculatorValues(def.fields,'metric'),'metric');const b=def.compute(initialCalculatorValues(def.fields,'imperial'),'imperial');
 const value=(s:string)=>Number(s.replace(/,/g,'').split(' ')[0]);expect(value(a.results[0].value)/25.4).toBeCloseTo(value(b.results[0].value),1);
});
it('steel stair spine agrees with bracket rise and going',()=>{
 const def=getVerifiedDefinition('steel-spine-stairs');const values=initialCalculatorValues(def.fields,'metric');const out=def.compute(values,'metric');
 const angle=Number(out.results.find(r=>r.label==='Spine angle')!.value.replace('°',''));expect(angle).toBeCloseTo(Math.atan2(175,270)*180/Math.PI,3);
 const spine=Number(out.results[0].value.replace(/,/g,'').replace(' mm',''));expect(spine).toBeCloseTo(15*Math.hypot(175,270),2);
});
it('balanced spacing selects the attainable clear gap nearest the target',async()=>{
 const {balancedSpacing}=await import('./balanced-spacing');
 const g=balancedSpacing(3600,45,450)!;expect(g.count).toBe(6);expect(g.gap).toBeCloseTo((3600-6*45)/7,12);
 for(const span of [300,2400,3600,4800])for(const width of [10,45,90])for(const target of [0,50,95,450]){
   const layout=balancedSpacing(span,width,target)!;
   const best=Math.min(...Array.from({length:Math.floor(span/width)},(_,i)=>Math.abs((span-(i+1)*width)/(i+2)-target)));
   expect(Math.abs(layout.gap-target)).toBeCloseTo(best,8);expect(layout.count*width+(layout.count+1)*layout.gap).toBeCloseTo(span,8);
 }
 expect(balancedSpacing(3600,45,95,true)!.gap).toBeLessThanOrEqual(95);
});

import {validateSnapshot,type CalculationSnapshot} from './calculation-record';
import {calculateConcrete,calculateRafter,calculateTileFit} from './calculations';
import {getTool} from './tools';
import {computeQuoteTotals,round2,clampMarkupPct,clampTaxRate} from '@/lib/quote-defaults';
import type {QuoteData,QuoteLineItem} from '@/lib/quote-types';
export type MaterialSuggestion={key:string;description:string;quantity:number;unit:string;basis:string};
export function materialSuggestion(s:CalculationSnapshot):MaterialSuggestion|null {
  const v=s.values as Record<string,number>,metric=s.unit==='metric';
  if(s.slug==='concrete-slab'){
    const g=calculateConcrete(v.length,v.width,v.thickness,v.waste,metric);
    return{key:'concrete-order',description:'Concrete for slab',quantity:metric?g.orderVolume:g.orderVolume/27,unit:metric?'m³':'yd³',basis:`Slab volume including ${v.waste}% allowance, applied once. Confirm supplier order increment.`};
  }
  if(s.slug==='common-rafter'){
    const g=calculateRafter(v.run,v.angle,v.overhang,v.depth,v.seat,v.wallHeight);
    return{key:'rafter-length',description:`Rafter timber ${v.depth} × ${v.thickness} ${metric?'mm':'in'}`,quantity:g.totalLength/(metric?1000:12),unit:metric?'m':'ft',basis:'Net length for one rafter including overhang. Stock rounding, end trimming and multiple rafters are not included.'};
  }
  if(s.slug==='tile-layout'){
    const g=calculateTileFit(v.floor,v.tile,v.joint);
    return{key:'tile-count',description:'Tiles for entered rows',quantity:Math.ceil(g.count*v.rowsInput*(1+v.waste/100)),unit:'each',basis:`${g.count} tiles per row × ${v.rowsInput} rows with ${v.waste}% allowance, rounded up once. Cut pieces counted as whole tiles; reuse is not assumed.`};
  }
  return null;
}
export type HandoffInput={snapshot:CalculationSnapshot;mode:'calculated'|'manual';description:string;quantity?:number;unit?:string;unitPrice:number;clientName:string};
export function validateHandoff(raw:unknown):HandoffInput {
  if(!raw||typeof raw!=='object')throw new Error('Enter the material to transfer.');
  const b=raw as HandoffInput,snapshot=validateSnapshot(b.snapshot);
  if(b.mode!=='calculated'&&b.mode!=='manual')throw new Error('Choose a quantity source.');
  const description=typeof b.description==='string'?b.description.trim():'';
  const clientName=typeof b.clientName==='string'?b.clientName.trim():'';
  if(!description||description.length>500||clientName.length>200)throw new Error('Enter a material description up to 500 characters and a client name up to 200 characters.');
  if(typeof b.unitPrice!=='number'||!Number.isFinite(b.unitPrice)||b.unitPrice<0||b.unitPrice>1e6)throw new Error('Enter a unit price between 0 and 1,000,000.');
  if(b.mode==='calculated'&&!materialSuggestion(snapshot))throw new Error('Enter a material quantity for this geometry calculation.');
  if(b.mode==='manual'&&(!Number.isFinite(b.quantity)||typeof b.quantity!=='number'||b.quantity<=0||b.quantity>1e9||typeof b.unit!=='string'||!b.unit.trim()||b.unit.length>30))throw new Error('Enter a positive material quantity and unit.');
  const suggestion=materialSuggestion(snapshot);
  const quantity=b.mode==='calculated'?suggestion!.quantity:b.quantity!;
  if(!Number.isFinite(quantity)||quantity<=0||quantity*b.unitPrice>1e9)throw new Error('This material quantity or total is too large for a quote.');
  return{snapshot,mode:b.mode,description,clientName,unitPrice:b.unitPrice,...(b.mode==='manual'?{quantity:b.quantity,unit:b.unit!.trim()}:{})};
}
export function handoffQuote(input:HandoffInput,profile:{currency:string;tax_label:string;tax_rate:number;default_markup_pct:number},fingerprint:string):QuoteData {
  const {snapshot:s}=input,tool=getTool(s.slug)!,suggestion=materialSuggestion(s);
  const quantity=input.mode==='calculated'?suggestion!.quantity:input.quantity!;
  const unit=input.mode==='calculated'?suggestion!.unit:input.unit!;
  const line:QuoteLineItem={type:'material',description:input.description,quantity,unit,unit_price:input.unitPrice,line_total:round2(quantity*input.unitPrice),quantity_source:input.mode==='calculated'?'calculator':'user',quantity_confirmed:true,is_calculated_takeoff:input.mode==='calculated',is_missing_price:input.unitPrice===0,is_ai_estimated:false,
    t2qcal_source_key:input.mode==='calculated'?suggestion!.key:'user-material',t2qcal_basis_fingerprint:fingerprint,
    t2qcal_assumptions:[input.mode==='calculated'?suggestion!.basis:'Material quantity entered by the user; geometry results do not determine this quantity.'],
    t2qcal_provenance_note:JSON.stringify(s),
    t2qcal_calculator_snapshot:{toolSlug:s.slug,toolName:tool.name,inputs:Object.entries(s.values).filter((entry):entry is [string,number]=>typeof entry[1]==='number').map(([key,value])=>({key,label:key,value,unit:'',displayLabel:`${key}: ${value} (${s.unit} calculator)`}))},
  };
  const markup_pct=clampMarkupPct(profile.default_markup_pct),tax_rate=clampTaxRate(profile.tax_rate);
  return{client:{name:input.clientName,address:null,email:null,phone:null},job_summary:`${tool.name} material estimate`,line_items:[line],...computeQuoteTotals([line],markup_pct,tax_rate),markup_pct,tax_rate,tax_label:profile.tax_label,currency:profile.currency,terms:'',notes:[]};
}

import {planSourceNote} from "./plan-measurement";
import {validateSnapshot,computeSnapshot,type CalculationSnapshot} from './calculation-record';
import {getTool} from './tools';
import {getVerifiedDefinition} from './verified-calculators';
import {computeQuoteTotals,round2,clampMarkupPct,clampTaxRate} from '@/lib/quote-defaults';
import type {QuoteData,QuoteLineItem} from '@/lib/quote-types';
export type MaterialSuggestion={key:string;description:string;quantity:number;unit:string;basis:string};
/**
 * The quantity the calculator itself offers for a quote line — the native
 * app's handoff for this tool (first material handoff the native app includes
 * by default). Tools with no native handoff offer manual entry only.
 */
export function materialSuggestion(s:CalculationSnapshot):MaterialSuggestion|null {
  const out=computeSnapshot(s);
  if(out.errors?.length)return null;
  const handoffs=out.handoffs??[];
  const h=handoffs.find(x=>x.role==='material'&&x.includeByDefault)??handoffs.find(x=>x.role==='material');
  if(!h||!Number.isFinite(h.quantity)||h.quantity<=0)return null;
  const basis=[h.formula,...(h.assumptions??[])].filter((t):t is string=>typeof t==='string'&&t.trim().length>0).join(' ');
  return{key:h.key,description:h.label,quantity:h.quantity,unit:h.unit,basis:basis||'Quantity from the calculator geometry, applied once. Confirm on site before ordering.'};
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
    t2qcal_assumptions:[...(s.planSource?[planSourceNote(s.planSource)]:[]),input.mode==='calculated'?suggestion!.basis:'Material quantity entered by the user; geometry results do not determine this quantity.'],
    t2qcal_provenance_note:JSON.stringify(s),
    t2qcal_calculator_snapshot:{toolSlug:s.slug,toolName:tool.name,inputs:Object.entries(s.values).filter((entry):entry is [string,number]=>typeof entry[1]==='number').map(([key,value])=>({key,label:getVerifiedDefinition(s.slug).fields.find(f=>f.key===key)?.label??key,value,unit:'',displayLabel:`${getVerifiedDefinition(s.slug).fields.find(f=>f.key===key)?.label??key}: ${value} (${s.unit} calculator)`}))},
  };
  const markup_pct=clampMarkupPct(profile.default_markup_pct),tax_rate=clampTaxRate(profile.tax_rate);
  return{client:{name:input.clientName,address:null,email:null,phone:null},job_summary:`${tool.name} material estimate`,line_items:[line],...computeQuoteTotals([line],markup_pct,tax_rate),markup_pct,tax_rate,tax_label:profile.tax_label,currency:profile.currency,terms:'',notes:[]};
}

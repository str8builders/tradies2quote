import {describe,it,expect} from "vitest";
import {planQuantity,validatePlanSource,type PlanSource} from "./plan-measurement";
import {validateSnapshot} from "./calculation-record";
import {handoffQuote,validateHandoff} from "./quote-handoff";
const source=(overrides:Partial<PlanSource>={}):PlanSource=>({version:1,fileHash:"a".repeat(64),fileName:"Revision C.pdf",page:2,label:"Kitchen",kind:"rectangle",points:[{x:100,y:100},{x:200,y:150}],calibration:{points:[{x:0,y:0},{x:100,y:0}],metres:10},...overrides});
describe("calibrated plan measurements",()=>{
 it("measures lengths, rectangles, polygons and counts in SI units",()=>{
  expect(planQuantity(validatePlanSource(source()))).toEqual({quantity:50,unit:"m²"});
  expect(planQuantity(validatePlanSource(source({kind:"length",points:[{x:10,y:10},{x:40,y:50}]}))).quantity).toBe(5);
  expect(planQuantity(validatePlanSource(source({kind:"area",points:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}]}))).quantity).toBe(50);
  expect(planQuantity(validatePlanSource(source({kind:"count",points:[{x:0,y:0},{x:1,y:1},{x:2,y:2}],calibration:undefined})))).toEqual({quantity:3,unit:"each"});
 });
 it("rejects crossed polygons, zero scales, nonfinite points and malformed sources",()=>{
  for(const value of [source({kind:"area",points:[{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]}),source({calibration:{points:[{x:0,y:0},{x:0,y:0}],metres:10}}),source({points:[{x:NaN,y:0},{x:2,y:2}]}),source({fileHash:"not-a-hash"}),source({page:0}),source({calibration:undefined})])expect(()=>validatePlanSource(value)).toThrow();
 });
 it("keeps measured quantity and provenance through snapshot validation and quote creation",()=>{
  const planSource=source(),snapshot=validateSnapshot({version:1,slug:"plan-takeoff",unit:"metric",values:{quantity:50},planSource});
  const input=validateHandoff({snapshot,mode:"calculated",description:"Kitchen flooring",unitPrice:30,clientName:"Fixture"});
  const quote=handoffQuote(input,{currency:"NZD",tax_label:"GST",tax_rate:.15,default_markup_pct:0},"fingerprint");
  expect(quote.line_items[0].quantity).toBe(50);expect(quote.line_items[0].line_total).toBe(1500);expect(quote.line_items[0].t2qcal_provenance_note).toContain('Revision C.pdf');expect(quote.line_items[0].t2qcal_assumptions?.join()).toContain('page 2');
  expect(()=>validateSnapshot({...snapshot,values:{quantity:500}})).toThrow("marked points");
 });
});

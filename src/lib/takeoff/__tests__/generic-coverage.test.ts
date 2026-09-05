import { describe, it, expect } from "vitest";
import { runGenericCalculator } from "../calculators/generic";
import type { ExtractedExtraction } from "../schemas";
const base: ExtractedExtraction = {confidence:1,project_type:null,scope_type:"generic",sub_scopes:[],dimensions:{area_m2:24},openings:[],notes:[],needs_clarification:[],clarification_questions:[],source_basis:"manual",waste_percent:10,material_spec:"Custom covering"};
describe("generic material coverage uses explicit dimensions",()=>{
  it("converts covered area to lineal metres without guessing coverage",()=>{
    const result=runGenericCalculator({...base,coverage_mm:150});
    expect(result.lines[0]).toMatchObject({quantity:176,unit:"m",status:"needs_review"});
    expect(result.lines[0].basis.inputs.coverage_mm).toBe(150);
  });
  it("rounds supplied stock lengths upward and flags cut planning",()=>{
    const result=runGenericCalculator({...base,coverage_mm:150,stock_length_m:4.8});
    expect(result.lines[0]).toMatchObject({quantity:37,unit:"length"});
    expect(result.assumptions.join(" ")).toMatch(/cut lengths/);
  });
  it("keeps an area estimate when no coverage is provided",()=>{
    expect(runGenericCalculator(base).lines[0]).toMatchObject({quantity:26.4,unit:"m²"});
  });
  it("rejects malformed geometry and impossible coverage",()=>{
    for(const v of [NaN,Infinity,-1,0]) expect(runGenericCalculator({...base,coverage_mm:v}).status).toBe("blocked");
  });
  it("does not round down before stock conversion",()=>{
    const result=runGenericCalculator({...base,dimensions:{length_m:1.2001,width_m:2.4},coverage_mm:1200,stock_length_m:2.4,waste_percent:0});
    expect(result.lines[0].quantity).toBe(2);
  });
});

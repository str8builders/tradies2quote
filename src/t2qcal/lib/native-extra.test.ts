import {describe,it,expect} from "vitest";
import fixtures from "./fixtures/native-extra.json";
import {getVerifiedDefinition} from "./verified-calculators";
import {pavingRing} from "./native-extra-calculators";
import {validateSnapshot} from "./calculation-record";
import {initialCalculatorValues} from "./calculator-inputs";
describe("Swift-generated native calculator references",()=>{
 for(const [i,row] of fixtures.entries())it(`${row.slug} ${row.unit} reference ${i}`,()=>{
 const values=Object.fromEntries(Object.entries(row.values).filter((entry):entry is [string,number]=>typeof entry[1]==="number")),unit=row.unit as "metric"|"imperial",output=getVerifiedDefinition(row.slug).compute(values,unit);
 expect(output.errors).toBeUndefined();const actual=row.slug==="paving-ring"?pavingRing(values):output.diagramValues;
 for(const [key,value] of Object.entries(row.expected))expect(actual?.[key as keyof typeof actual]).toBeCloseTo(value!,8);
 expect(()=>validateSnapshot({version:1,slug:row.slug,unit,values})).not.toThrow();
 });
 it("reports an impossible ring and excessive drain station count the way the native app does",()=>{
 for(const [slug,override] of [["paving-ring",{diameter:300}],["pipe-fall",{run:1e6,marks:.01}]] as const){const d=getVerifiedDefinition(slug),o=d.compute({...initialCalculatorValues(d.fields,"metric"),...override},"metric");expect(o.errors).toBeUndefined();expect(o.results.map(r=>[r.label,r.primary])).toEqual([["Check inputs",true]]);expect(o.diagramValues?.invalid).toBe(1);}
 });
 it("keeps exact capacity multiples from creating phantom downpipes",()=>{const d=getVerifiedDefinition("spouting-downpipes"),v=initialCalculatorValues(d.fields,"metric");expect(d.compute(v,"metric").diagramValues?.outlets).toBe(1);expect(d.compute({...v,capacity:.5},"metric").diagramValues?.outlets).toBe(5);});
});

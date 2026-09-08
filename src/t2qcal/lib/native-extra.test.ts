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
 it("rejects an impossible ring and excessive drain station count",()=>{
 for(const [slug,override] of [["paving-ring",{diameter:300}],["pipe-fall",{run:1e6,marks:.01}]] as const){const d=getVerifiedDefinition(slug);expect(d.compute({...initialCalculatorValues(d.fields,"metric"),...override},"metric").errors?.length).toBeGreaterThan(0);}
 });
 it("keeps exact capacity multiples from creating phantom downpipes",()=>{const d=getVerifiedDefinition("spouting-downpipes"),v=initialCalculatorValues(d.fields,"metric");expect(d.compute(v,"metric").diagramValues?.outlets).toBe(1);expect(d.compute({...v,capacity:.5},"metric").diagramValues?.outlets).toBe(5);});
});

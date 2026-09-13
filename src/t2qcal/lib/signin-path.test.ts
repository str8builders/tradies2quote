import {expect,it} from "vitest";
import {calculatorNextPath} from "./signin-path";
it("keeps sign-in destinations inside the T2QCAL scope",()=>{
  expect(calculatorNextPath("/t2qcal/calculator/common-rafter?resume=1")).toBe("/t2qcal/calculator/common-rafter?resume=1");
  expect(calculatorNextPath("/t2qcal")).toBe("/t2qcal");
  expect(calculatorNextPath("/app/quotes")).toBe("/t2qcal/calculators");
  expect(calculatorNextPath("https://evil.example/t2qcal/x")).toBe("/t2qcal/calculators");
  expect(calculatorNextPath("//evil.example")).toBe("/t2qcal/calculators");
  expect(calculatorNextPath(undefined)).toBe("/t2qcal/calculators");
});

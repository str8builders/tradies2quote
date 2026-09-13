"use client";
import {upgradeSnapshotValues,validateSnapshot} from "@/t2qcal/lib/calculation-record";

/**
 * Hand a measurement to a calculator. The calculator page restores a pending
 * snapshot from sessionStorage when opened with ?resume=1 (the same path the
 * sign-in round trip uses), so a measured angle lands in the right field with
 * every other input at its native default.
 */
export function sendToCalculator(slug:string,values:Record<string,number>,name:string):string|null{
  try{
    const snapshot=validateSnapshot({version:1,slug,unit:"metric",values:upgradeSnapshotValues(slug,"metric",values)});
    sessionStorage.setItem(`t2qcal.pending.${slug}`,JSON.stringify({snapshot,name}));
    window.location.assign(`/t2qcal/calculator/${slug}?resume=1`);
    return null;
  }catch(e){return e instanceof Error?e.message:"This measurement could not be sent to the calculator.";}
}

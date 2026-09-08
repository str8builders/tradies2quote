"use client";
import {createContext,useContext,useState,type Dispatch,type SetStateAction} from "react";
import type {CalculationSnapshot} from "@/t2qcal/lib/calculation-record";
export type SavedCalculation = {id:string;name:string;snapshot:CalculationSnapshot;revision:number;updated_at:string};
const Seed=createContext<SavedCalculation|null>(null);
export function CalculationSeed({record,children}:{record:SavedCalculation|null;children:React.ReactNode}) {return <Seed.Provider value={record}>{children}</Seed.Provider>;}
export function useCalculationSeed(){return useContext(Seed);}
export function useCalculationValue<T extends number|string>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>] {
  const saved=useCalculationSeed();
  return useState<T>(()=>{const candidate=saved?.snapshot.values[key];return typeof candidate===typeof initial ? candidate as T : initial;});
}

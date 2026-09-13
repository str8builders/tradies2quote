"use client";
import {useCallback,useEffect,useState,useSyncExternalStore} from "react";
import {ArrowSquareOut,BookOpen,CheckCircle,CloudArrowDown,Trash} from "@phosphor-icons/react";
import {documentPath,hasDocumentStore,keepDocument,listKeptDocuments,removeDocument,storageSummary,type LibraryResource} from "@/t2qcal/lib/resource-library";

const subscribeOnline=(notify:()=>void)=>{window.addEventListener("online",notify);window.addEventListener("offline",notify);return()=>{window.removeEventListener("online",notify);window.removeEventListener("offline",notify);};};
const subscribeDisplay=(notify:()=>void)=>{const m=window.matchMedia("(display-mode: standalone)");m.addEventListener("change",notify);return()=>m.removeEventListener("change",notify);};

/**
 * The tradie's offline shelf, shared by the Resources tab and the standards
 * section under every calculator: which documents are kept, keeping and
 * removing them, storage use, and whether this browser can keep anything.
 */
export function useDocumentShelf(){
  const [kept,setKept]=useState<Set<string>>(()=>new Set());
  const [busy,setBusy]=useState<Set<string>>(()=>new Set());
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [store,setStore]=useState<{usage:number;quota:number}|null>(null);
  const [supported,setSupported]=useState<boolean|null>(null);
  const online=useSyncExternalStore(subscribeOnline,()=>navigator.onLine,()=>true);
  const standalone=useSyncExternalStore(subscribeDisplay,()=>window.matchMedia("(display-mode: standalone)").matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone),()=>false);
  const refresh=useCallback(async()=>{
    if(!hasDocumentStore()){setSupported(false);return;}
    setSupported(true);
    try{setKept(await listKeptDocuments());}catch{/* Storage was cleared or blocked; the list stays empty. */}
    setStore(await storageSummary());
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const keep=useCallback(async(id:string)=>{
    setErrors(e=>{const n={...e};delete n[id];return n;});
    setBusy(b=>new Set(b).add(id));
    try{await keepDocument(id);setKept(k=>new Set(k).add(id));setStore(await storageSummary());}
    catch(e){setErrors(prev=>({...prev,[id]:e instanceof Error?e.message:"This document could not be saved."}));}
    finally{setBusy(b=>{const n=new Set(b);n.delete(id);return n;});}
  },[]);
  const remove=useCallback(async(id:string)=>{
    try{await removeDocument(id);setKept(k=>{const n=new Set(k);n.delete(id);return n;});setStore(await storageSummary());}
    catch{setErrors(prev=>({...prev,[id]:"This document could not be removed."}));}
  },[]);
  return {kept,busy,errors,store,supported,online,standalone,keep,remove};
}

export type Shelf=ReturnType<typeof useDocumentShelf>;

/** One document row: title, publisher, Open, and Keep offline / Kept for PDFs. */
export function ResourceRow({r,shelf}:{r:LibraryResource;shelf:Shelf}){
  const {kept,busy,errors,supported,online,standalone,keep,remove}=shelf;
  const isKept=kept.has(r.id),isBusy=busy.has(r.id),href=r.pdf?documentPath(r.id):r.page;
  return <article className="native-row native-doc" data-testid={`resource-${r.id}`} data-kept={isKept}>
    <span className="native-glyph">{isKept?<CheckCircle size={18} weight="fill"/>:<BookOpen size={18} weight="fill"/>}</span>
    <span><strong>{r.title}</strong><small>{r.publisher} · {r.detail}</small>{r.note&&<small>{r.note}</small>}{errors[r.id]&&<small className="native-doc-error" role="alert">{errors[r.id]}</small>}</span>
    <span className="native-doc-actions">
      {r.pdf?<a className="native-pill native-pill-primary" href={href} target={standalone?undefined:"_blank"} rel={standalone?undefined:"noopener noreferrer"} aria-label={`Open ${r.title}`}>Open</a>
      :<a className="native-pill" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.title} on the publisher's site`}><ArrowSquareOut size={14} weight="bold"/>Web</a>}
      {r.pdf&&supported&&(isKept?<button type="button" className="native-pill" onClick={()=>void remove(r.id)} aria-label={`Remove ${r.title} from this phone`}><Trash size={14} weight="bold"/>Kept</button>
      :<button type="button" className="native-pill" onClick={()=>void keep(r.id)} disabled={isBusy||!online} aria-label={`Keep ${r.title} offline`}><CloudArrowDown size={14} weight="bold"/>{isBusy?"Saving…":"Keep offline"}</button>)}
    </span>
  </article>;
}

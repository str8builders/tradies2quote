"use client";
import {useCallback,useEffect,useMemo,useState,useSyncExternalStore} from "react";
import {ArrowSquareOut,BookOpen,CheckCircle,CloudArrowDown,DownloadSimple,MagnifyingGlass,Trash,WifiSlash} from "@phosphor-icons/react";
import {documentPath,formatBytes,hasDocumentStore,keepDocument,listKeptDocuments,matchesQuery,removeDocument,storageSummary,type LibraryResource} from "@/t2qcal/lib/resource-library";

const subscribeOnline=(notify:()=>void)=>{window.addEventListener("online",notify);window.addEventListener("offline",notify);return()=>{window.removeEventListener("online",notify);window.removeEventListener("offline",notify);};};
const subscribeDisplay=(notify:()=>void)=>{const m=window.matchMedia("(display-mode: standalone)");m.addEventListener("change",notify);return()=>m.removeEventListener("change",notify);};

/**
 * The Resources tab: every manual, span table and code in the T2QCAL
 * catalogue, with "Keep offline" for the PDFs. Kept documents stream once
 * through the in-scope proxy into Cache Storage; the service worker then
 * answers them without a network, so the books open on site with no signal.
 * Web pages (no PDF) stay online-only links to the publisher.
 */
export function ResourcesLibrary({resources}:{resources:LibraryResource[]}){
  const [query,setQuery]=useState("");
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
  // Browser-owned storage is read after hydration, once.
  useEffect(()=>{void refresh();},[refresh]);

  const groups=useMemo(()=>{const ids=[...new Set(resources.map(r=>r.group))];return ids.map(id=>({id,name:resources.find(r=>r.group===id)!.groupName,rows:resources.filter(r=>r.group===id&&matchesQuery(r,query))})).filter(g=>g.rows.length>0);},[resources,query]);
  const pdfCount=resources.filter(r=>r.pdf).length;

  async function keep(id:string){
    setErrors(e=>{const n={...e};delete n[id];return n;});
    setBusy(b=>new Set(b).add(id));
    try{await keepDocument(id);setKept(k=>new Set(k).add(id));setStore(await storageSummary());}
    catch(e){setErrors(prev=>({...prev,[id]:e instanceof Error?e.message:"This document could not be saved."}));}
    finally{setBusy(b=>{const n=new Set(b);n.delete(id);return n;});}
  }
  async function remove(id:string){
    try{await removeDocument(id);setKept(k=>{const n=new Set(k);n.delete(id);return n;});setStore(await storageSummary());}
    catch{setErrors(prev=>({...prev,[id]:"This document could not be removed."}));}
  }
  async function keepGroup(rows:LibraryResource[]){
    for(const r of rows)if(r.pdf&&!kept.has(r.id)&&!busy.has(r.id))await keep(r.id);
  }

  return <main className="native-page">
    <section className="native-hero"><div className="native-eyebrow">{"// NO SIGNAL NEEDED"}</div><h1>THE BOOKS.<br/><em>ON THE JOB.</em></h1><p>{resources.length} manuals, span tables and codes. Keep any of the {pdfCount} PDFs on this phone and open them on site without reception.</p></section>
    <label className="native-search native-search-open"><MagnifyingGlass size={19}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${resources.length} documents`} aria-label="Search documents"/></label>
    <div className="native-status-row" data-testid="resources-status">
      <span className={online?"native-chip":"native-chip native-chip-warn"}>{online?<CheckCircle size={14} weight="fill"/>:<WifiSlash size={14} weight="bold"/>}{online?"Online":"Offline — kept documents still open"}</span>
      <span className="native-chip"><DownloadSimple size={14} weight="bold"/>{kept.size} kept offline{store?` · ${formatBytes(store.usage)} used`:""}</span>
    </div>
    {supported===false&&<p className="native-footnote" role="status">This browser cannot keep documents offline. Open T2QCAL in Safari or Chrome, or install it to your Home Screen, to use Keep offline.</p>}
    {groups.length===0&&<p className="native-footnote">No documents match this search.</p>}
    {groups.map(group=>{const pdfs=group.rows.filter(r=>r.pdf),remaining=pdfs.filter(r=>!kept.has(r.id)).length;return <section key={group.id}>
      <h2 className="native-section-label"><span>{group.name}</span>{supported&&pdfs.length>1&&remaining>0&&<button type="button" className="native-link-button" onClick={()=>void keepGroup(group.rows)} disabled={!online}>Keep all {remaining}</button>}</h2>
      <div className="native-group">{group.rows.map(r=>{const isKept=kept.has(r.id),isBusy=busy.has(r.id),href=r.pdf?documentPath(r.id):r.page;return <article className="native-row native-doc" key={r.id} data-testid={`resource-${r.id}`} data-kept={isKept}>
        <span className="native-glyph">{isKept?<CheckCircle size={18} weight="fill"/>:<BookOpen size={18} weight="fill"/>}</span>
        <span><strong>{r.title}</strong><small>{r.publisher} · {r.detail}</small>{r.note&&<small>{r.note}</small>}{errors[r.id]&&<small className="native-doc-error" role="alert">{errors[r.id]}</small>}</span>
        <span className="native-doc-actions">
          {r.pdf?<a className="native-pill native-pill-primary" href={href} target={standalone?undefined:"_blank"} rel={standalone?undefined:"noopener noreferrer"} aria-label={`Open ${r.title}`}>Open</a>
          :<a className="native-pill" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.title} on the publisher's site`}><ArrowSquareOut size={14} weight="bold"/>Web</a>}
          {r.pdf&&supported&&(isKept?<button type="button" className="native-pill" onClick={()=>void remove(r.id)} aria-label={`Remove ${r.title} from this phone`}><Trash size={14} weight="bold"/>Kept</button>
          :<button type="button" className="native-pill" onClick={()=>void keep(r.id)} disabled={isBusy||!online} aria-label={`Keep ${r.title} offline`}><CloudArrowDown size={14} weight="bold"/>{isBusy?"Saving…":"Keep offline"}</button>)}
        </span>
      </article>;})}</div>
    </section>;})}
    <p className="native-footnote">Documents are the publishers’ own and open from their servers; a kept copy stays only on this phone for your own use. Publisher access conditions still apply. {standalone?"Swipe from the left edge to come back from an open document.":""}</p>
  </main>;
}

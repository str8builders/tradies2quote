"use client";
import {useMemo,useState} from "react";
import {CheckCircle,DownloadSimple,MagnifyingGlass,WifiSlash} from "@phosphor-icons/react";
import {formatBytes,matchesQuery,type LibraryResource} from "@/t2qcal/lib/resource-library";
import {ResourceRow,useDocumentShelf} from "./ResourceShelf";

/**
 * The Resources tab: every manual, span table and code in the T2QCAL
 * catalogue, with "Keep offline" for the PDFs. Kept documents stream once
 * through the in-scope proxy into Cache Storage; the service worker then
 * answers them without a network, so the books open on site with no signal.
 * Web pages (no PDF) stay online-only links to the publisher.
 */
export function ResourcesLibrary({resources}:{resources:LibraryResource[]}){
  const [query,setQuery]=useState("");
  const shelf=useDocumentShelf();
  const {kept,busy,store,supported,online,standalone,keep}=shelf;
  const groups=useMemo(()=>{const ids=[...new Set(resources.map(r=>r.group))];return ids.map(id=>({id,name:resources.find(r=>r.group===id)!.groupName,rows:resources.filter(r=>r.group===id&&matchesQuery(r,query))})).filter(g=>g.rows.length>0);},[resources,query]);
  const pdfCount=resources.filter(r=>r.pdf).length;
  async function keepGroup(rows:LibraryResource[]){for(const r of rows)if(r.pdf&&!kept.has(r.id)&&!busy.has(r.id))await keep(r.id);}
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
      <div className="native-group">{group.rows.map(r=><ResourceRow key={r.id} r={r} shelf={shelf}/>)}</div>
    </section>;})}
    <p className="native-footnote">Documents are the publishers’ own and open from their servers; a kept copy stays only on this phone for your own use. Publisher access conditions still apply. {standalone?"Swipe from the left edge to come back from an open document.":""}</p>
  </main>;
}

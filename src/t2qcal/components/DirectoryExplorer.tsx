"use client";
import {useEffect,useRef,useState} from "react";
import {House,Steps,Ruler,Cube,Wrench,CircleDashed,GridFour,ArrowsLeftRight,Triangle,Package,CaretRight,MagnifyingGlass} from "@phosphor-icons/react";
import catalog from "@/t2qcal/lib/native-catalog.json";
import {getTool} from "@/t2qcal/lib/tools";
const icons={roof:House,stairs:Steps,spacing:Ruler,concrete:Cube,metal:Wrench,templates:CircleDashed,deck:GridFour,convert:ArrowsLeftRight,geometry:Triangle,materials:Package};
function Glyph({category}:{category:string}){const Icon=icons[category as keyof typeof icons]??Ruler;return <span className="native-glyph"><Icon size={18} weight="fill"/></span>;}
export function DirectoryExplorer(){
 const [query,setQuery]=useState("");const [searching,setSearching]=useState(false);const search=useRef<HTMLInputElement>(null);
 useEffect(()=>{
   const focusSearch=()=>{setSearching(true);window.setTimeout(()=>search.current?.focus(),0);};
   const requested=()=>{if(location.hash==="#search"||new URLSearchParams(location.search).has("search"))focusSearch();};
   const timer=window.setTimeout(requested,0);
   const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();focusSearch();}};
   window.addEventListener("keydown",key);window.addEventListener("hashchange",requested);
   return()=>{window.clearTimeout(timer);window.removeEventListener("keydown",key);window.removeEventListener("hashchange",requested);};
 },[]);
 const shown=catalog.tools.filter(t=>`${t.name} ${t.summary}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <main className="native-page"><section className="native-hero"><div className="native-eyebrow">{"// FOR THE TOOLS"}</div><h1>MEASURE ONCE.<br/><em>DRAWN RIGHT.</em></h1><p>{catalog.tools.length} construction calculators with live measured drawings, running set-out lists and 3D assemblies.</p></section><label className="native-search" style={searching?undefined:{display:"none"}}><MagnifyingGlass size={19}/><input ref={search} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${catalog.tools.length} calculators`} aria-label="Search calculators"/></label>
 {!query&&<section><h2 className="native-section-label">{"// POPULAR"}</h2><div className="native-popular">{catalog.tools.filter(t=>t.popular&&getTool(t.slug)).map(t=><a key={t.slug} href={`/t2qcal/calculator/${t.slug}`}><Glyph category={t.category}/>{t.name}</a>)}</div></section>}
 {catalog.categories.map(category=>{const rows=shown.filter(t=>t.category===category.id);return rows.length>0&&<section key={category.id}><h2 className="native-section-label"><Glyph category={category.id}/>{category.name}</h2><div className="native-group">{rows.map(t=>getTool(t.slug)?<a className="native-row" key={t.slug} href={`/t2qcal/calculator/${t.slug}`}><Glyph category={t.category}/><span><strong>{t.name}</strong><small>{t.summary}</small></span><CaretRight size={15}/></a>:<div className="native-row" key={t.slug}><Glyph category={t.category}/><span><strong>{t.name}</strong><small>Native calculator · web conversion in progress</small></span></div>)}</div></section>;})}
 {shown.length===0&&<p className="native-footnote">No calculators match this search.</p>}</main>;
}

"use client";
import { useEffect, useState } from "react";
import type { QuoteData } from "@/lib/quote-types";
export function SavedClientPicker({onSelect,disabled}:{onSelect:(client:QuoteData['client'])=>void;disabled:boolean}){
 const [items,setItems]=useState<(QuoteData['client']&{id:string})[]>([]);
 useEffect(()=>{const c=new AbortController();fetch('/api/clients',{signal:c.signal}).then(async r=>{if(r.ok){const d=await r.json();setItems(d.clients);}}).catch(()=>{});return()=>c.abort();},[]);
 if(!items.length)return null;
 return <label className="mb-4 block text-xs text-ink-300">Use a saved client<select disabled={disabled} defaultValue="" onChange={e=>{const c=items.find(i=>i.id===e.target.value);if(c)onSelect({name:c.name,address:c.address,email:c.email,phone:c.phone});e.target.value='';}} className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-ink-900 px-3 text-sm text-white"><option value="">Choose a client…</option>{items.map(c=><option key={c.id} value={c.id}>{c.name}{c.email?` — ${c.email}`:''}</option>)}</select></label>;
}
export function TermsTemplatePicker({onSelect,disabled}:{onSelect:(terms:string)=>void;disabled:boolean}){
 const [items,setItems]=useState<{id:string;title:string;body:string}[]>([]);
 useEffect(()=>{const c=new AbortController();fetch('/api/terms-templates',{signal:c.signal}).then(async r=>{if(r.ok){const d=await r.json();setItems(d.templates);}}).catch(()=>{});return()=>c.abort();},[]);
 if(!items.length)return null;
 return <label className="my-3 block text-xs text-ink-300">Replace with a saved template<select disabled={disabled} defaultValue="" onChange={e=>{const t=items.find(i=>i.id===e.target.value);if(t)onSelect(t.body);e.target.value='';}} className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-ink-900 px-3 text-sm text-white"><option value="">Choose terms…</option>{items.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><span className="mt-2 block">Review the wording before saving this quote.</span></label>;
}

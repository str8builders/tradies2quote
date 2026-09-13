"use client";
import {useRef,useState} from 'react';
import type {CalculationSnapshot} from '@/t2qcal/lib/calculation-record';
import {materialSuggestion,validateHandoff} from '@/t2qcal/lib/quote-handoff';
export function QuoteTransfer({snapshot}:{snapshot:CalculationSnapshot}){
  const suggestion=materialSuggestion(snapshot);
  const [manual,setManual]=useState(false),[description,setDescription]=useState(''),[quantity,setQuantity]=useState(''),[unit,setUnit]=useState(''),[price,setPrice]=useState({raw:'',basis:snapshot.unit}),[client,setClient]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[draft,setDraft]=useState(''),[login,setLogin]=useState(false);
  // Keep a request's ID and contents through network failures. A changed form
  // must not accidentally create another draft while the previous one is uncertain.
  const pending=useRef<{id:string;body:string}|null>(null);
  const calculated=!!suggestion&&!manual;
  const rateFactor=snapshot.slug==='concrete-slab'?.764554857984:snapshot.slug==='common-rafter'?.3048:1;
  const enteredPrice=price.raw===''?(calculated&&snapshot.slug==='concrete-slab'?Number(snapshot.values.rate):0):Number(price.raw)*(calculated&&price.basis!==snapshot.unit?(snapshot.unit==='imperial'?rateFactor:1/rateFactor):1);
  const displayedPrice=price.raw===''?(calculated&&snapshot.slug==='concrete-slab'?String(snapshot.values.rate):''):String(enteredPrice);
  async function transfer(retry=false){
    if(busy)return;
    try{
      const checked=retry&&pending.current?validateHandoff(JSON.parse(pending.current.body)):validateHandoff({snapshot,mode:calculated?'calculated':'manual',description:description.trim()||(calculated?suggestion!.description:''),quantity:quantity===''?undefined:Number(quantity),unit,unitPrice:enteredPrice,clientName:client});
      const body=JSON.stringify(checked);
      if(pending.current&&pending.current.body!==body){setMessage('A previous transfer is still unconfirmed. Restore those inputs and retry, or check your drafts before starting another transfer.');return;}
      pending.current??={id:crypto.randomUUID(),body};
      setBusy(true);setMessage('');setLogin(false);
      const response=await fetch(`/api/t2qcal/quotes/${pending.current.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:pending.current.body,signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if(!response.ok){if(response.status===401)setLogin(true);if(response.status>=400&&response.status<500)pending.current=null;throw new Error(data.error??'The draft could not be created.');}
      setDraft(data.id);pending.current=null;setMessage('Draft created. Review the client, material quantities, prices and tax in Tradies2Quote.');
    }catch(e){setMessage(e instanceof Error?e.message:'Unable to confirm this draft. Retry the same transfer.');}
    finally{setBusy(false);}
  }
  function signIn(){try{sessionStorage.setItem(`t2qcal.pending.${snapshot.slug}`,JSON.stringify({snapshot,name:'Saved working'}));window.location.assign(`/t2qcal/signin?next=${encodeURIComponent(`/t2qcal/calculator/${snapshot.slug}?resume=1`)}`);}catch{setMessage('Save a copy of the inputs before signing in; this browser could not keep them.');}}
  return <section className="save-working" aria-label="Create quote from calculation"><h2>Use in Tradies2Quote</h2><p>Create a private draft using your business currency, markup and tax settings. Review it before sending to a customer.</p>
    {suggestion&&<label><input type="checkbox" checked={manual} onChange={e=>{setManual(e.target.checked);setPrice({raw:'',basis:snapshot.unit});}} disabled={busy||!!draft}/> Enter a different material quantity</label>}
    {calculated?<p><strong>{suggestion!.quantity.toLocaleString(undefined,{maximumFractionDigits:6})} {suggestion!.unit}</strong> · {suggestion!.basis}</p>:<p>Enter the material quantity for this job. The calculator working will be attached for reference.</p>}
    <div className="field-grid"><label>Material description<input value={description} placeholder={calculated?suggestion!.description:'e.g. Treated timber'} maxLength={500} onChange={e=>setDescription(e.target.value)} disabled={busy||!!draft}/></label>
    {!calculated&&<><label>Quantity<input type="number" min="0" step="any" value={quantity} onChange={e=>setQuantity(e.target.value)} disabled={busy||!!draft}/></label><label>Unit<input value={unit} maxLength={30} placeholder="m, m², each…" onChange={e=>setUnit(e.target.value)} disabled={busy||!!draft}/></label></>}
    <label>Unit price before tax<input type="number" min="0" max="1000000" step="0.01" value={displayedPrice} placeholder="Price later in draft" onChange={e=>setPrice({raw:e.target.value,basis:snapshot.unit})} disabled={busy||!!draft}/></label>
    <label>Client name (optional)<input value={client} maxLength={200} onChange={e=>setClient(e.target.value)} disabled={busy||!!draft}/></label></div>
    <div className="save-actions">{draft?<><a className="directory-button" href={`/app/quotes/preview/${draft}`}>Review draft in Tradies2Quote</a><button onClick={()=>{setDraft('');setMessage('');}}>Start another draft</button></>:<button className="directory-button" onClick={()=>transfer()} disabled={busy}>{busy?'Creating draft…':'Create quote draft'}</button>}<a href="/app/quotes">View my quotes</a></div>
    {message&&<p role="status">{message}</p>}{message&&!draft&&!busy&&!login&&<button onClick={()=>transfer(true)}>Retry previous transfer</button>}{login&&<button onClick={signIn}>Sign in and keep calculator inputs</button>}
  </section>;
}

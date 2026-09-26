"use client";
import { formatNZNumericDate } from "@/lib/format-date";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PLANS, type PlanId } from "@/lib/plans";
import { teamWords } from "@/lib/team-copy";
type TeamData = { team: { name: string; id: string } | null; isOwner: boolean; active: boolean; plan: PlanId; seats: number; roster: { members: { user_id: string; email: string; owner: boolean }[]; invitations: { id: string; email: string; expires_at: string }[] } };
const field = "min-h-11 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-ink-500";
/** `inApp` (from the server): inside the iPhone app there are no plan names, subscriptions or plan links (3.1.3(f)). */
export function TeamManager({ initialInvite = "", inApp = false }: { initialInvite?: string; inApp?: boolean }) {
  const words=teamWords(inApp);
  const [code,setCode]=useState("");const [codeSent,setCodeSent]=useState(false);
  const [data,setData]=useState<TeamData|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [link,setLink]=useState("");const [notice,setNotice]=useState("");const [invite,setInvite]=useState(initialInvite);
  const load=useCallback(async()=>{try{const r=await fetch('/api/team');const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}catch(e){setError(e instanceof Error?e.message:'Unable to load your team.');}},[]);
  // Refresh state follows an asynchronous API response; this is external data synchronisation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();},[load]);
  async function act(action:string,values:Record<string,string>={}){
    setBusy(true);setError("");setNotice("");
    try{const r=await fetch('/api/team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...values})});const d=await r.json();if(!r.ok)throw Error(d.error);if(d.codeSent){setCodeSent(true);setNotice('Check your inbox for an 8-digit verification code.');}else if(d.link)setLink(d.link);else setNotice(action==='accept'?'You have joined the team.':'Changes saved.');if(action==='accept'){setInvite('');window.history.replaceState(window.history.state,'','/app/team');}await load();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
  }
  return <div className="mt-8 space-y-6">
    {error&&<p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}{notice&&<p role="status" className="text-sm text-green-300">{notice}</p>}
    {invite&&<section className="t2q-card-pro p-6"><h2 className="text-xl font-semibold">You have a team invitation</h2><p className="my-4 text-sm text-ink-300">{words.invite}</p><button disabled={busy} onClick={()=>void act('verify',{token:invite})} className="t2q-btn-ghost-pro">{codeSent?'Resend email code':'Email me a verification code'}</button>{codeSent&&<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();void act('accept',{token:invite,code});}}><label className="block text-sm">Email verification code<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} inputMode="numeric" autoComplete="one-time-code" maxLength={8} minLength={8} required className={`${field} mt-2`} /></label><p className="text-xs text-ink-400">The code expires in 10 minutes.</p><button disabled={busy} className="t2q-btn-primary-pro">Verify & join team</button></form>}</section>}
    {!data ? <p role="status" className="text-sm text-ink-400">{error ? <button onClick={()=>void load()} className="min-h-11 underline">Retry loading team</button> : 'Loading your team…'}</p> : <>
      <section className="t2q-card-pro p-6">{words.showPlan ? <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-brand">{PLANS[data.plan].name}</p><h2 className="mt-2 text-2xl font-semibold">{data.team?.name ?? words.noTeamHeading}</h2></div><Link href="/app/upgrade" className="t2q-btn-ghost-pro">Manage plan</Link></div> : <h2 className="text-2xl font-semibold">{data.team?.name ?? words.noTeamHeading}</h2>}
      {!data.active&&<p className="mt-4 text-sm text-ink-300">{words.sharingOff}</p>}
      {!data.team&&data.active&&<form className="mt-5 flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act('create',{name:String(f.get('name'))});}}><input name="name" aria-label="Team name" maxLength={100} required placeholder="Your business name" className={field}/><p className="text-xs leading-relaxed text-ink-400">Joining members will be able to read and update your existing client list. Their quotes remain private to their own accounts.</p><button disabled={busy} className="t2q-btn-primary-pro">Create team</button></form>}
      {data.team&&!data.isOwner&&<><p className="mt-4 text-sm text-ink-300">{words.ownerManages}</p><button disabled={busy} onClick={()=>void act('leave')} className="mt-5 min-h-11 text-sm underline">Leave team</button></>}
      </section>
      {data.team&&data.isOwner&&<section className="t2q-card-pro p-6"><h2 className="text-xl font-semibold">People & invitations</h2><p className="mt-2 text-sm text-ink-300">{data.roster.members.length} members · {data.roster.invitations.length} pending · {data.seats} seats, including you</p>
      {data.roster.members.length>data.seats&&<p role="alert" className="mt-3 text-sm text-amber-300">{words.overLimit}</p>}
      <ul className="mt-5 divide-y divide-white/10">{data.roster.members.map(m=><li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="break-all text-sm">{m.email}{m.owner&&<span className="ml-2 text-ink-400">Owner</span>}</span>{!m.owner&&<button disabled={busy} onClick={()=>void act('remove',{user_id:m.user_id})} className="min-h-11 text-sm text-ink-300 underline">Remove member</button>}</li>)}{data.roster.invitations.map(i=><li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="break-all">{i.email}<small className="block text-ink-400">Invitation expires {formatNZNumericDate(i.expires_at)}</small></span><button disabled={busy} onClick={()=>void act('revoke',{id:i.id})} className="min-h-11 underline">Revoke invitation</button></li>)}</ul>
      {data.active&&<form className="mt-5 space-y-3" onSubmit={e=>{e.preventDefault();void act('invite',{email:String(new FormData(e.currentTarget).get('email'))});}}><label className="block text-sm">Invite a teammate<input name="email" type="email" maxLength={254} required placeholder="name@business.co.nz" className={`${field} mt-2`}/></label><p className="text-xs leading-relaxed text-ink-400">Create a private link for this email address. Share it with that person yourself. Links expire after 7 days and reserve a seat.</p><button disabled={busy} className="t2q-btn-primary-pro">Create invitation link</button></form>}
      {link&&<div className="mt-5 rounded-xl border border-brand/30 bg-brand/5 p-4"><label className="text-sm">Invitation link<input readOnly value={link} onFocus={e=>e.currentTarget.select()} className={`${field} mt-2`}/></label><button className="mt-2 min-h-11 text-sm font-semibold text-brand" onClick={async()=>{try{await navigator.clipboard.writeText(link);setNotice('Invitation link copied.');}catch{setNotice('Select and copy the link above.');}}}>Copy link</button></div>}
      </section>}
      <div className="flex flex-wrap gap-3"><Link href="/app/clients" className="t2q-btn-ghost-pro">Open client list</Link>{data.plan==='builder'&&<Link href="/app/templates" className="t2q-btn-ghost-pro">Terms templates</Link>}</div>
    </>}
  </div>;
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { getTeamContext } from "@/lib/team";
import { isStripeConfigured, getPlanPriceId } from "@/lib/stripe-client";
import { PLANS, type PlanId } from "@/lib/plans";
import { HideInNativeApp } from "@/app/_components/HideInNativeApp";
import { isNativeShellRequest } from "@/lib/native-shell";
import { AppHeader } from "../_components/AppHeader";
import { CheckoutButton } from "./_components/CheckoutButton";
import { ManageBillingButton } from "../settings/_components/ManageBillingButton";
export const metadata={title:"Choose your plan"};
export const dynamic="force-dynamic";
export default async function UpgradePage({searchParams}:{searchParams:Promise<{stripe?:string;plan?:string;from?:string}>}){
 const query=await searchParams;const db=await createClient();const{data:{user}}=await db.auth.getUser();if(!user)redirect('/login');
 const sub=await getSubscriptionStatus({userId:user.id,signedUpAt:new Date(user.created_at!),email:user.email});
 const nativeFallback=<main className="mx-auto max-w-3xl px-4 py-14"><h1 className="text-3xl font-semibold">{sub.state==='expired'?'New quotes are paused on your account.':'Account information'}</h1><p className="mt-4 text-sm text-ink-300">You can still view, send and download your existing quotes and invoices.</p></main>;
 if(await isNativeShellRequest())return <div className="text-white"><AppHeader context="Account"/>{nativeFallback}</div>;
 const team=await getTeamContext(user.id);
 const managed=team.team&&!team.isOwner;
 const activeBilling=!!sub.stripeCustomerId&&sub.state==='paid';
 return <div className="min-h-screen text-white"><AppHeader context="Plans"/><HideInNativeApp fallback={nativeFallback}><main className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><div className="t2q-section-label-pro">{"// room to grow"}</div><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A plan for the way you work.</h1><p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-300">{sub.state==='expired'?'Your trial has ended. Choose a plan to create new quotes. Existing quotes remain available.':'Start on your own, or bring your crew. One monthly price, including GST. Cancel anytime.'}</p>
 {query.stripe==='cancelled'&&<p role="status" className="mt-6 text-sm text-ink-300">Checkout was cancelled. You can choose a plan when you’re ready.</p>}
 {query.stripe==='success'&&<div role="status" className="t2q-card-pro mt-6 p-5"><p>{sub.state==='paid'?'Your subscription is active.':'Your checkout is complete. We are waiting for Stripe to confirm your subscription.'}</p><Link href={sub.state==='paid'?'/app/team':'/app/upgrade?stripe=success'} className="mt-2 inline-flex min-h-11 items-center text-sm text-brand">{sub.state==='paid'?'Set up your team':'Refresh subscription status'}</Link></div>}
 {managed?<section className="t2q-card-pro mt-8 p-6"><h2 className="text-xl font-semibold">Your team owner manages billing</h2><p className="my-4 text-sm text-ink-300">You belong to {team.team!.name}. Contact the owner for plan changes.</p><Link href="/app/team" className="t2q-btn-ghost-pro">Your team</Link></section>:<>
 {activeBilling&&<section className="t2q-card-pro mt-8 flex flex-wrap items-center justify-between gap-4 p-6"><div><h2 className="font-semibold">Your subscription is active</h2><p className="mt-2 text-sm text-ink-300">Change plans, update payment details or cancel through Stripe. When reducing seats, remove extra team members first.</p></div><ManageBillingButton/></section>}
 <div className="mt-8 grid gap-5 lg:grid-cols-3">{(Object.keys(PLANS) as PlanId[]).map(id=>{const plan=PLANS[id];const ready=isStripeConfigured()&&!!getPlanPriceId(id)&&(id==='solo'||process.env.TEAM_PLANS_ENABLED==='true');return <section key={id} data-testid={`upgrade-plan-${id}`} className={`t2q-card-pro flex flex-col p-6 ${query.plan===id?'!border-brand/70':''}`}><p className="text-xs uppercase tracking-widest text-ink-400">{plan.tag}</p><h2 className="mt-3 text-2xl font-semibold">{plan.name}</h2><p className="my-5"><strong className="text-4xl text-brand">${plan.price}</strong><span className="ml-2 text-xs text-ink-300">NZD / month · incl. GST</span></p><ul className="mb-7 flex-1 space-y-3 text-sm text-ink-200">{plan.features.map(f=><li key={f} className="flex gap-2"><span aria-hidden="true" className="text-brand">✓</span>{f}</li>)}</ul>{activeBilling?<p className="text-sm text-ink-300">Use Manage subscription above to change plans.</p>:ready?<CheckoutButton plan={id}/>:<p data-testid="upgrade-stripe-missing" className="text-sm text-ink-300">This plan opens after setup and verification are complete.</p>}</section>;})}</div>
 <p className="mt-6 text-xs leading-relaxed text-ink-400">Your payment details are handled by Stripe. A subscription starts when you complete checkout. Crew and Builder seat counts include the owner. Team members share clients and keep their quotes in their own accounts.</p></>}
 </main></HideInNativeApp></div>;
}

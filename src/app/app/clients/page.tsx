import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { AppHeader } from "../_components/AppHeader";
import { ClientsManager } from "./ClientsManager";
import { ClientsBook } from "./_newlook/ClientsBook";
export const metadata={title:"Clients"};
export default async function ClientsPage(){const db=await createClient();const{data:{user}}=await db.auth.getUser();if(!user)redirect('/login');
// Redesign: the new look's list and edit sheet under <AppHeader>'s top bar. Off: unchanged below.
if(await isNewLookOn())return <Screen data-testid="clients-screen"><AppHeader context="Clients"/><div className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-10"><ClientsBook/></div></Screen>;
return <div className="min-h-screen text-white"><AppHeader context="Clients"/><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><header className="t2q-page-intro"><div className="t2q-section-label-pro">{"// your address book"}</div><h1 className="mt-3 text-3xl font-semibold">Clients.</h1><p className="mt-3 text-sm text-ink-300">Keep contact details ready for your next quote.</p></header><ClientsManager/></main></div>;}

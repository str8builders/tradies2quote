import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {SavedWorking} from "@/t2qcal/components/SavedWorking";
export default async function SavedPage(){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/t2qcal/signin?next=%2Ft2qcal%2Fsaved");return <SavedWorking key={user.id}/>;}

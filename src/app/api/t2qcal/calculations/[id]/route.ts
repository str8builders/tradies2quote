import {calculatorAccount,privateHeaders,smallJSON} from "@/lib/t2qcal-api";
import {isUUID,validateSnapshot} from "@/t2qcal/lib/calculation-record";
type Context={params:Promise<{id:string}>};
export async function PUT(request:Request,context:Context){
  const auth=await calculatorAccount(request,true);if(auth.error)return auth.error;
  const {id}=await context.params;if(!isUUID(id))return Response.json({error:"Invalid saved calculation."},{status:400,headers:privateHeaders});
  let snapshot,name,revision;
  try{const body=await smallJSON(request) as {snapshot:unknown;name:unknown;revision:unknown};snapshot=validateSnapshot(body.snapshot);name=typeof body.name==="string"?body.name.trim():"";revision=body.revision;if(!name||name.length>120||!Number.isSafeInteger(revision)||((revision as number)<0||(revision as number)>2147483646))throw new Error("Enter a name up to 120 characters and a valid saved version.");}
  catch(e){return Response.json({error:e instanceof Error?e.message:"Invalid calculation."},{status:400,headers:privateHeaders});}
  const payload={name,snapshot,revision:(revision as number)+1,updated_at:new Date().toISOString()};
  const query=revision===0?auth.db.from("t2qcal_calculations").insert({id,user_id:auth.user.id,...payload}):auth.db.from("t2qcal_calculations").update(payload).eq("id",id).eq("user_id",auth.user.id).eq("revision",revision);
  const {data,error}=await query.select("id,name,snapshot,revision,updated_at").maybeSingle();
  if(data)return Response.json({record:data},{headers:privateHeaders});
  if(!error || error.code==="23505"){
    const {data:current}=await auth.db.from("t2qcal_calculations").select("id,name,snapshot,revision,updated_at").eq("id",id).eq("user_id",auth.user.id).maybeSingle();
    if(current && current.name===name){try{if(JSON.stringify(validateSnapshot(current.snapshot))===JSON.stringify(snapshot))return Response.json({record:current},{headers:privateHeaders});}catch{/* An older or corrupt record must never bypass conflict protection. */}}
    return Response.json({error:"This saved calculation changed elsewhere. Reopen it before saving, or save a new copy."},{status:409,headers:privateHeaders});
  }
  return Response.json({error:"Your working was not saved. Please try again."},{status:503,headers:privateHeaders});
}
export async function DELETE(request:Request,context:Context){
  const auth=await calculatorAccount(request,true);if(auth.error)return auth.error;
  const {id}=await context.params;if(!isUUID(id))return Response.json({error:"Invalid saved calculation."},{status:400,headers:privateHeaders});
  const {error}=await auth.db.from("t2qcal_calculations").delete().eq("id",id).eq("user_id",auth.user.id);
  return error?Response.json({error:"The calculation was not removed."},{status:503,headers:privateHeaders}):new Response(null,{status:204,headers:privateHeaders});
}

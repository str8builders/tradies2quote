import {calculatorAccount,privateHeaders} from "@/lib/t2qcal-api";
export async function GET(request:Request){
  const auth=await calculatorAccount(request);if(auth.error)return auth.error;
  const offset=Number(new URL(request.url).searchParams.get("offset")??0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return Response.json({error:"Invalid page."},{status:400,headers:privateHeaders});
  const {data,error}=await auth.db.from("t2qcal_calculations").select("id,name,snapshot,revision,updated_at").eq("user_id",auth.user.id).order("updated_at",{ascending:false}).order("id").range(offset,offset+49);
  if(error)return Response.json({error:"Saved working could not be loaded. Please try again."},{status:503,headers:privateHeaders});
  return Response.json({records:data,nextOffset:data.length===50?offset+50:null},{headers:privateHeaders});
}

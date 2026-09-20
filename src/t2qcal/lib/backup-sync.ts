import {workingDB,type WorkingDB,type BackupItem,type Receipt} from "./local-db";
import {isUUID,validateSnapshot} from "./calculation-record";
export async function queueBackup(input:Pick<BackupItem,"ownerId"|"id"|"name"|"snapshot"|"revision">,db=workingDB){
  if(!isUUID(input.ownerId)||!isUUID(input.id)||!input.name.trim()||input.name.trim().length>120||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error("Check the account, calculation name and version.");
  const snapshot=validateSnapshot(input.snapshot);
  await db.transaction("rw",db.outbox,db.receipts,async()=>{
    const receipt=await db.receipts.get([input.ownerId,input.id]);
    const target=receipt?.serverId??input.id;
    const old=await db.outbox.get([input.ownerId,target]);
    if(old?.status==="sending"&&old.leaseUntil>Date.now())throw new Error("This backup is being sent. Wait for its result before saving again.");
    if(old?.status==="conflict")throw new Error("Resolve this calculation’s backup conflict in Your working first.");
    await db.outbox.put({...input,id:target,...(target!==input.id?{sourceId:input.id}:{}),name:input.name.trim(),snapshot,revision:old?.revision??receipt?.revision??input.revision,operation:crypto.randomUUID(),status:"pending",attempts:0,nextAttempt:0,leaseUntil:0,error:""});
  });
}
/** A transaction lease serializes tabs. The server revision makes a response lost after commit safe to retry. */
export async function flushBackups(ownerId:string,fetcher:typeof fetch=fetch,db:WorkingDB=workingDB){
  const candidates=await db.outbox.where("ownerId").equals(ownerId).toArray();
  for(const candidate of candidates){
    const item=await db.transaction("rw",db.outbox,async()=>{
      const current=await db.outbox.get([ownerId,candidate.id]);
      if(!current||current.status==="conflict"||current.status==="error"||current.nextAttempt>Date.now()||current.leaseUntil>Date.now())return null;
      const leased:BackupItem={...current,status:"sending",leaseUntil:Date.now()+30_000,attempts:current.attempts+1};await db.outbox.put(leased);return leased;
    });
    if(!item)continue;
    let record:Receipt|undefined,status:BackupItem["status"]="pending",error="",pause=false;
    try{
      const response=await fetcher(`/api/t2qcal/calculations/${item.id}`,{method:"PUT",headers:{"Content-Type":"application/json","X-T2Q-Owner":ownerId},body:JSON.stringify({name:item.name,snapshot:item.snapshot,revision:item.revision}),signal:AbortSignal.timeout(20_000)});
      const data=await response.json();
      if(response.ok){
        if(data.record?.id!==item.id||!Number.isSafeInteger(data.record?.revision)||data.record.revision<1)throw new Error("The backup response could not be verified. It will be retried.");
        record={...data.record,ownerId,snapshot:validateSnapshot(data.record.snapshot)};
      }else{
        status=response.status===409?"conflict":response.status>=400&&response.status<500&&![401,403,429].includes(response.status)?"error":"pending";
        error=typeof data.error==="string"?data.error:"Backup will retry when the connection is available.";
        pause=response.status===401||response.status===403;
      }
    }catch(e){error=e instanceof Error?e.message:"Backup will retry when the connection is available.";}
    await db.transaction("rw",db.outbox,db.receipts,async()=>{
      const current=await db.outbox.get([ownerId,item.id]);if(current?.operation!==item.operation)return;
      if(record){await db.receipts.put(record);if(item.sourceId)await db.receipts.put({...record,id:item.sourceId,serverId:record.id});await db.outbox.delete([ownerId,item.id]);}
      else await db.outbox.put({...current,status,error,leaseUntil:0,nextAttempt:Date.now()+Math.min(300_000,5_000*2**Math.min(current.attempts,6))});
    });
    if(pause)break;
  }
}
export async function retryBackup(ownerId:string,id:string,db=workingDB){await db.transaction("rw",db.outbox,async()=>{const item=await db.outbox.get([ownerId,id]);if(item&&item.status!=="conflict"&&item.leaseUntil<=Date.now())await db.outbox.put({...item,status:"pending",nextAttempt:0,error:""});});}
export async function resolveBackup(ownerId:string,id:string,copy:boolean,db=workingDB){
  await db.transaction("rw",db.outbox,db.receipts,async()=>{
    const item=await db.outbox.get([ownerId,id]);if(!item||item.status!=="conflict")return;
    if(copy){
      const target=crypto.randomUUID(),sourceId=item.sourceId??item.id;
      await db.outbox.put({...item,id:target,sourceId,operation:crypto.randomUUID(),revision:0,status:"pending",attempts:0,nextAttempt:0,error:"",leaseUntil:0});
      await db.receipts.put({ownerId,id:sourceId,serverId:target,revision:0,name:item.name,snapshot:item.snapshot,updated_at:new Date().toISOString()});
    }
    await db.outbox.delete([ownerId,id]);
  });
}

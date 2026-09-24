import {createHash} from 'node:crypto';
import {calculatorAccount,privateHeaders,smallJSON} from '@/lib/t2qcal-api';
import {round2,resolveTaxLabel} from '@/lib/quote-defaults';
import {isUUID} from '@/t2qcal/lib/calculation-record';
import {validateHandoff,handoffQuote} from '@/t2qcal/lib/quote-handoff';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await calculatorAccount(request,true);if(auth.error)return auth.error;
  const {id}=await params;
  if(!isUUID(id))return Response.json({error:'Invalid draft reference.'},{status:400,headers:privateHeaders});
  let input;
  try{input=validateHandoff(await smallJSON(request));}catch(e){return Response.json({error:e instanceof Error?e.message:'Check the material inputs.'},{status:400,headers:privateHeaders});}
  // Fingerprint the transfer exactly as sent, so a retry of the same request
  // still resolves to the draft it already created.
  const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  // A converted calculator price can arrive with sub-cent noise
  // ($191.138714496/yd³); a quote line carries a price in cents.
  input={...input,unitPrice:round2(input.unitPrice)};
  const existing=async()=>auth.db.from('quotes').select('id,quote_data').eq('id',id).eq('user_id',auth.user.id).maybeSingle();
  const previous=await existing();
  if(previous.error)return Response.json({error:'Unable to check this draft. Please try again.'},{status:503,headers:privateHeaders});
  function priorResponse(data:NonNullable<typeof previous.data>){
    return data.quote_data?.line_items?.[0]?.t2qcal_basis_fingerprint===fingerprint
      ?Response.json({id:data.id},{headers:privateHeaders})
      :Response.json({error:'This draft reference already exists with different working. Open the existing draft or start another transfer.'},{status:409,headers:privateHeaders});
  }
  if(previous.data)return priorResponse(previous.data);
  const {data:profile,error}=await auth.db.from('profiles').select('country,currency,tax_label,tax_rate,default_markup_pct').eq('id',auth.user.id).single();
  if(error||!profile||!['NZD','AUD','USD','CAD','GBP'].includes(profile.currency)||!Number.isFinite(profile.tax_rate)||!Number.isFinite(profile.default_markup_pct))return Response.json({error:'Complete your business currency, tax and markup settings in Tradies2Quote before creating a draft.'},{status:422,headers:privateHeaders});
  const quote=handoffQuote(input,{...profile,tax_label:resolveTaxLabel(profile.tax_label,profile.country,profile.currency)},fingerprint);
  const created=await auth.db.from('quotes').insert({id,user_id:auth.user.id,status:'draft',currency:quote.currency,total_amount:quote.total,quote_data:quote}).select('id').single();
  if(created.error){
    if(created.error.code==='23505'){const retry=await existing();if(retry.data)return priorResponse(retry.data);}
    return Response.json({error:'The draft could not be created. Retry to check the same draft reference.'},{status:503,headers:privateHeaders});
  }
  return Response.json({id:created.data.id},{status:201,headers:privateHeaders});
}

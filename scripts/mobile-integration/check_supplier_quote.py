"""Supplier quote creation/retry through real HTTP; no extractor/provider call."""
import json,os,urllib.request,urllib.error,uuid
from pathlib import Path
root=Path(os.environ['T2Q_INTEGRATION_CONFIG_DIR']).resolve()
cfg=json.loads((root/'private.json').read_text()); users=json.loads((root/'users.json').read_text()); results=[]
def call(label,path,method='GET',body=None,owner='alice',expected=200,rest=False):
 headers={'Content-Type':'application/json','Authorization':'Bearer '+users[owner]['access_token']}
 if rest: headers['apikey']=cfg['anon']
 req=urllib.request.Request(('http://127.0.0.1:14300/rest/v1/' if rest else 'http://127.0.0.1:14100/api/')+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=60) as r: status=r.status; raw=r.read()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read()
 value=json.loads(raw); results.append({'check':label,'status':status,'passed':status==expected})
 assert status==expected, label+': '+str(status)+' '+str(value)[:400]
 return value
try:
 # Reauthenticate synthetic identities without ever printing or recording tokens in evidence.
 for owner,user in users.items():
  req=urllib.request.Request('http://127.0.0.1:14300/auth/v1/token?grant_type=password',data=json.dumps({'email':user['email'],'password':cfg['password']}).encode(),headers={'Content-Type':'application/json','apikey':cfg['anon']})
  with urllib.request.urlopen(req,timeout=30) as r: session=json.load(r)
  user.update({k:session[k] for k in ['access_token','refresh_token']})
 (root/'users.json').write_text(json.dumps(users));(root/'users.json').chmod(0o600)
 identifier=str(uuid.uuid4()); path='mobile/v1/materials/scan-quote'
 body={'lines':[{'name':'Supplier acceptance timber','unit':'each','quantity':2,'price':10,'line_total':20}], 'meta':{'supplier':'Synthetic Supplier','gstInclusive':False,'subtotal':20,'gst':3,'total':23,'idempotencyKey':identifier}}
 result=call('Create supplier quote atomically',path,'POST',body);assert result['id']==identifier
 item=call('Read saved source and items','quotes?id=eq.'+identifier+'&select=quote_data,ai_snapshot,revision,quote_items(*)',rest=True)[0]
 assert item['quote_data']==item['ai_snapshot'];assert item['quote_data']['total']==23;assert len(item['quote_items'])==1
 call('Retry supplier creation',path,'POST',body)
 quote=item['quote_data'];quote['job_summary']='Edited after supplier import'
 call('Edit imported quote','mobile/v1/quotes/'+identifier+'/save','POST',{'quote_data':quote,'expectedRevision':item['revision']})
 call('Retry original operation after customer edits',path,'POST',body)
 preserved=call('Original source survives replay','quotes?id=eq.'+identifier+'&select=quote_data,ai_snapshot,quote_items(*)',rest=True)[0]
 assert preserved['quote_data']['job_summary']=='Edited after supplier import';assert preserved['ai_snapshot']['job_summary']!='Edited after supplier import';assert len(preserved['quote_items'])==1
 altered=json.loads(json.dumps(body));altered['lines'][0]['price']=15;altered['meta']['acknowledge']=True
 call('Reject reuse with changed payload',path,'POST',altered,expected=409)
 call('Reject another account operation collision',path,'POST',body,owner='bob',expected=409)
 call('Reject null supplier metadata',path,'POST',{'lines':body['lines'],'meta':None},expected=400)
 call('Reject null supplier row',path,'POST',{'lines':[None],'meta':body['meta']},expected=400)
 call('Reject string acknowledgement',path,'POST',{'lines':body['lines'],'meta':{**body['meta'],'acknowledge':'yes'}},expected=400)
 call('Remove supplier test quote','mobile/v1/quotes/'+identifier+'/delete','POST',{})
 print(json.dumps({'passed':True,'checks':len(results)}))
finally:(root/'supplier-results.json').write_text(json.dumps(results,indent=2))

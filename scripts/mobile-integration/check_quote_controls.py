import json,urllib.request,urllib.error,uuid
from pathlib import Path
import os
root=Path(os.environ['T2Q_INTEGRATION_CONFIG_DIR']).resolve();users=json.loads((root/'users.json').read_text());results=[]
def call(label,path,method='GET',body=None,owner='alice',expected=200):
 req=urllib.request.Request('http://127.0.0.1:14100/api'+path,data=json.dumps(body).encode() if method!='GET' else None,headers={'Content-Type':'application/json','Authorization':'Bearer '+users[owner]['access_token']},method=method)
 try:
  with urllib.request.urlopen(req,timeout=60) as r:status=r.status;raw=r.read()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read()
 try:value=json.loads(raw)
 except Exception:value={'bytes':len(raw)}
 results.append({'check':label,'status':status,'passed':status==expected})
 assert status==expected,label+' '+str(status)+' '+str(value)[:500]
 return value
try:
 dashboard=call('Dashboard counts with real HEAD requests','/mobile/v1/dashboard');assert all(isinstance(dashboard[k],int) for k in ['quotes','invoices','requests'])
 identifier=str(uuid.uuid4());base='/mobile/v1/quotes/'+identifier
 dims=[{'key':'deckLengthM','label':'Deck length','value':4.8,'unit':'m','confirmed':False},{'key':'deckWidthM','label':'Deck width','value':3,'unit':'m','confirmed':False}]
 quote={'client':{'name':'Test dimensions'},'job_summary':'Dimension acceptance','currency':'NZD','markup_pct':20,'tax_rate':15,'line_items':[{'type':'labour','description':'Install decking','quantity':1,'unit':'job','unit_price':800}], 'takeoff_inputs':{'deckLengthM':4.8,'deckWidthM':3,'joistSpacingMm':450,'wastePercent':10,'includePiles':True},'dimension_confirmation':{'required':True,'reasons':['no_scale'],'takeoff_type':'deck','dimensions':dims,'confirmed_by':None,'confirmed_at':None}}
 created=call('Create saved drawing fixture','/mobile/v1/quotes','POST',{'operationID':identifier,'transcript':'Test drawing fixture','quote_data':quote},expected=201)
 payload={'expectedRevision':created['revision'],'edits':[{'key':'deckLengthM','value':4.8},{'key':'deckWidthM','value':3}]}
 call('Reject another account dimension write',base+'/dimensions','POST',payload,owner='bob',expected=404)
 call('Reject invalid dimension',base+'/dimensions','POST',{**payload,'edits':[{'key':'deckLengthM','value':-1}]},expected=400)
 confirmed=call('Confirm saved dimensions atomically',base+'/dimensions','POST',payload);assert confirmed['changed'] is False
 saved=call('Reload dimension stamp',base)['item'];assert all(d['confirmed'] for d in saved['quote_data']['dimension_confirmation']['dimensions']);assert saved['quote_data']['dimension_confirmation']['confirmed_by']==users['alice']['id'];assert len(saved['quote_data']['line_items'])==1
 call('Reject stale dimension revision',base+'/dimensions','POST',payload,expected=409)
 changed=call('Correct dimension and recalculate',base+'/dimensions','POST',{'expectedRevision':saved['revision'],'edits':[{'key':'deckLengthM','value':7.2},{'key':'deckWidthM','value':3}]});assert changed['changed'] is True
 saved=call('Reload recalculated quote',base)['item'];assert len(saved['quote_data']['line_items'])>1;assert next(l for l in saved['quote_data']['line_items'] if l['type']=='labour')['unit_price']==800
 moderate='/quotes/'+identifier+'/chat/moderate'
 call('Reject null moderation payload',moderate,'POST',None,expected=400)
 call('Reject other account moderation',moderate,'POST',{'action':'disable'},owner='bob',expected=404)
 call('Block customer chat',moderate,'POST',{'action':'disable'})
 assert call('Read disabled chat flag',base)['item']['chat_disabled'] is True
 call('Unblock customer chat',moderate,'POST',{'action':'enable'})
 call('Persist internal abuse report',moderate,'POST',{'action':'report','reason':'Synthetic acceptance test'})
 call('Delete drawing fixture',base+'/delete','POST',{})
 call('Reject deleted quote PDF','/quotes/'+identifier+'/pdf',expected=404)
 call('Reject deleted quote moderation',moderate,'POST',{'action':'disable'},expected=404)
 print(json.dumps({'passed':True,'checks':len(results)}))
except Exception as e:print(json.dumps({'passed':False,'checks':len(results),'error':str(e)}));raise
finally:(root/'quote-controls-results.json').write_text(json.dumps(results,indent=2))

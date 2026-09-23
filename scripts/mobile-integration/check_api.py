import json,urllib.request,urllib.error,uuid,time
from pathlib import Path
import os
root=Path(os.environ['T2Q_INTEGRATION_CONFIG_DIR']).resolve()
users=json.loads((root/'users.json').read_text());cfg=json.loads((root/'private.json').read_text());results=[]
def call(path,method='GET',body=None,owner='alice',expected=200):
 data=None if body is None else json.dumps(body).encode()
 headers={'Content-Type':'application/json'}
 if owner:headers['Authorization']='Bearer '+users[owner]['access_token']
 r=urllib.request.Request('http://127.0.0.1:14100'+path,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(r,timeout=60) as response:status=response.status;raw=response.read()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read()
 try:value=json.loads(raw)
 except Exception:value={'bytes':len(raw)}
 okay=status in expected if isinstance(expected,list) else status==expected
 results.append({'operation':method+' '+path,'owner':owner,'expected':expected,'actual':status,'passed':okay})
 if not okay:raise AssertionError(json.dumps(results[-1])+' '+str(value)[:500])
 return value
try:
 call('/api/mobile/v1/account',owner=None,expected=401)
 for owner in users:
  account=call('/api/mobile/v1/account',owner=owner);assert account['id']==users[owner]['id']
 quote={'client':{'name':'Integration Customer','email':'customer@example.invalid','phone':'','address':'Test site'},'job_summary':'Integration deck','currency':'NZD','markup_pct':20,'tax_rate':15,'tax_label':'GST','terms':'Test only','notes':[],'future':{'preserved':True},'line_items':[{'type':'material','description':'Deck boards','quantity':3,'unit':'each','unit_price':0.335,'t2qcal_source_key':'deck.boards'},{'type':'labour','description':'Installation','quantity':2,'unit':'hour','unit_price':75}]}
 identifier=str(uuid.uuid4());payload={'operationID':identifier,'transcript':'Test description','quote_data':quote}
 created=call('/api/mobile/v1/quotes','POST',payload,expected=201);revision=created['revision'];base='/api/mobile/v1/quotes/'+identifier
 call('/api/mobile/v1/quotes','POST',payload)
 call('/api/mobile/v1/quotes','POST',{**payload,'transcript':'Conflicting request'},expected=409)
 saved=call(base)['item'];assert saved['total_amount']==173.89;assert saved['quote_data']['future']['preserved'];assert saved['quote_data']['line_items'][0]['t2qcal_source_key']=='deck.boards'
 call(base,owner='bob',expected=404)
 call(base+'/save','POST',{'expectedRevision':revision,'quote_data':quote},owner='bob',expected=400)
 changed=call(base+'/save','POST',{'expectedRevision':revision,'transcript':'Updated description','quote_data':quote});assert changed['revision']!=revision
 call(base+'/save','POST',{'expectedRevision':revision,'quote_data':quote},expected=409)
 invalid=json.loads(json.dumps(quote));invalid['line_items'][0]['quantity']=-1
 call(base+'/save','POST',{'expectedRevision':changed['revision'],'quote_data':invalid},expected=400)
 assert call(base)['item']['voice_transcript']=='Updated description'
 call(base+'/schedule','POST',{'date':'2026-10-01'},expected=400)
 # These named fixtures are also selected by native UI tests. Reuse them on
 # subsequent rehearsals so duplicate-name validation is not a harness failure.
 existing_clients=call('/api/mobile/v1/clients')['items']
 if not any(c['name']=='Integration Client' for c in existing_clients):
  call('/api/clients','POST',{'name':'Integration Client','email':'client@example.invalid','address':'Test address'})
 contacts=call('/api/mobile/v1/clients');assert any(c['name']=='Integration Client' for c in contacts['items'])
 assert not call('/api/mobile/v1/clients',owner='bob')['items']
 existing_materials=call('/api/mobile/v1/materials')['items']
 if not any(m['name']=='Integration Material' for m in existing_materials):
  call('/api/mobile/v1/materials','POST',{'name':'Integration Material','unit':'each','default_unit_price':12.5})
 assert any(m['name']=='Integration Material' for m in call('/api/mobile/v1/materials')['items'])
 kit=call('/api/mobile/v1/kits','POST',{'name':'Integration Kit '+uuid.uuid4().hex[:8],'items':[{'type':'material','description':'Test board','unit':'each','quantity':2,'unit_price':10}]});assert kit['id']
 assert any(k['id']==kit['id'] and len(k['kit_items'])==1 for k in call('/api/mobile/v1/kits')['items'])
 call('/api/mobile/v1/notes','POST',{'date':'2026-10-01','body':'Integration day note'})
 assert any(n['body']=='Integration day note' for n in call('/api/mobile/v1/notes')['items'])
 call('/api/mobile/v1/consent','POST',{'granted':False})
 call('/api/quotes/generate','POST',{'id':identifier},expected=403)
 call('/api/mobile/v1/consent','POST',{'granted':True,'version':'2026-09-external-ai-v2'})
 assert call('/api/mobile/v1/account')['consented'] is True
 call('/api/mobile/v1/consent','POST',{'granted':False})
 assert call('/api/mobile/v1/account')['consented'] is False
 call(base+'/archive','POST',{})
 assert call(base)['item']['archived_at'] is not None
 call(base+'/restore','POST',{})
 call(base+'/delete','POST',{})
 call(base,expected=404)
 print(json.dumps({'passed':True,'requests':len(results),'scope':'real HTTP auth/database flows; no external provider calls'}))
except Exception as e:
 print(json.dumps({'passed':False,'requests':len(results),'error':str(e)}));raise
finally:
 (root/'api-results.json').write_text(json.dumps(results,indent=2))

"""Real HTTP acceptance against localhost's isolated database; synthetic accounts only."""
import json,urllib.request,urllib.error,uuid,time,datetime,struct,zlib,os
from pathlib import Path
import os
root=Path(os.environ['T2Q_INTEGRATION_CONFIG_DIR']).resolve()
cfg=json.loads((root/'private.json').read_text());results=[];token=None;user=None

def call(label,path,method='GET',body=None,expected=200,service=False,anonymous=False,raw=None,mime=None,backend=False):
 base='http://127.0.0.1:14100' if backend else 'http://127.0.0.1:14300'
 headers={'Content-Type':mime or 'application/json'}
 if not backend:headers['apikey']=cfg['service'] if service else cfg['anon']
 if not anonymous:headers['Authorization']='Bearer '+(cfg['service'] if service else token)
 data=raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
 req=urllib.request.Request(base+path,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=60) as r:status=r.status;value=r.read()
 except urllib.error.HTTPError as e:status=e.code;value=e.read()
 try:value=json.loads(value)
 except (ValueError,UnicodeDecodeError):pass
 passed=status in expected if isinstance(expected,list) else status==expected
 results.append({'check':label,'status':status,'passed':passed})
 if not passed:raise AssertionError(label+': '+str(status)+' '+str(value)[:600])
 return value

def app(label,path,method='GET',body=None,**kw):return call(label,'/api'+path,method,body,backend=True,**kw)
def rest(label,path,method='GET',body=None,**kw):return call(label,'/rest/v1/'+path,method,body,service=True,**kw)
def multipart(label,path,field,png):
 boundary='NativeAcceptance'+uuid.uuid4().hex
 data=(f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n').encode()+png+f'\r\n--{boundary}--\r\n'.encode()
 return app(label,path,'POST',raw=data,mime='multipart/form-data; boundary='+boundary)
def png():
 def chunk(k,d):return struct.pack('!I',len(d))+k+d+struct.pack('!I',zlib.crc32(k+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',16,16,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\xff\x60\x20'*16)*16))+chunk(b'IEND',b'')
try:
 # Buckets are configuration, absent from the schema-only clone.
 buckets=call('List isolated buckets','/storage/v1/bucket',service=True)
 existing={b['id'] for b in buckets}
 for name,public in [('business-logos',True),('profile-avatars',True),('quote-attachments',False),('quote-pdfs',False),('plan-uploads',False),('signatures',False)]:
  if name not in existing:call('Create isolated '+name,'/storage/v1/bucket','POST',{'id':name,'name':name,'public':public},service=True,expected=[200,201])
 email='native-delete-'+uuid.uuid4().hex[:10]+'@example.invalid'
 session=call('Create disposable account','/auth/v1/signup','POST',{'email':email,'password':cfg['password']},anonymous=True)
 token=session['access_token'];user=session['user']['id']
 (root/'deletion-fixture.json').write_text(json.dumps({'id':user,'email':email,'access_token':token}));os.chmod(root/'deletion-fixture.json',0o600)
 expires=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=1)).isoformat()
 rest('Seed test entitlement','subscriptions','POST',{'user_id':user,'plan':'crew','status':'active','current_period_end':expires},expected=201)
 app('Save business details','/mobile/v1/profile','POST',{'business_name':'Native Acceptance Builders','email':email,'phone':'','address':'Synthetic site','country':'NZ','currency':'NZD','tax_rate':15,'default_markup_pct':20})
 picture=png()
 logo=multipart('Upload business logo','/mobile/v1/business-logo','logo',picture)
 assert logo['logoUrl'].startswith('http://127.0.0.1:14300/')
 identifier=str(uuid.uuid4());base='/mobile/v1/quotes/'+identifier
 quote={'client':{'name':'Synthetic Customer','email':'customer@example.invalid','phone':'','address':'Test site'},'job_summary':'Document acceptance job','currency':'NZD','markup_pct':20,'tax_rate':15,'tax_label':'GST','terms':'Synthetic acceptance only','notes':[],'line_items':[{'type':'material','description':'Test boards','quantity':3,'unit':'each','unit_price':25},{'type':'labour','description':'Test labour','quantity':2,'unit':'hour','unit_price':75}]}
 app('Create document quote','/mobile/v1/quotes','POST',{'operationID':identifier,'transcript':'Test description','quote_data':quote},expected=201)
 multipart('Attach job photo','/quotes/'+identifier+'/photos','photo',picture)
 photos=app('List job photos','/quotes/'+identifier+'/photos')['photos'];assert len(photos)==1
 photo=app('Download owner photo','/quotes/'+identifier+'/photos?photo='+photos[0]['id']);assert photo[:3]==b'\xff\xd8\xff'
 app('Reject unauthenticated photo','/quotes/'+identifier+'/photos?photo='+photos[0]['id'],anonymous=True,expected=404)
 pdf=app('Generate quote PDF','/quotes/'+identifier+'/pdf');assert pdf[:5]==b'%PDF-';(root/'quote-fixture.pdf').write_bytes(pdf)
 other=json.loads((root/'users.json').read_text())['bob'];original=token;token=other['access_token']
 app('Reject cross-account PDF','/quotes/'+identifier+'/pdf',expected=404)
 app('Reject cross-account attachment','/quotes/'+identifier+'/photos?photo='+photos[0]['id'],expected=404)
 token=original
 app('Delete attached photo','/quotes/'+identifier+'/photos','DELETE',{'id':photos[0]['id']})
 app('Deleted photo inaccessible','/quotes/'+identifier+'/photos?photo='+photos[0]['id'],expected=404)
 multipart('Attach retained job photo','/quotes/'+identifier+'/photos','photo',picture)
 # Start at an already-sent fixture; no delivery is claimed or attempted.
 rest('Seed sent fixture state','quotes?id=eq.'+identifier,'PATCH',{'status':'sent'},expected=204)
 app('Accept sent quote',base+'/accept','POST',{})
 app('Schedule accepted quote',base+'/schedule','POST',{'date':'2026-10-02'})
 app('Start scheduled job',base+'/start','POST',{})
 app('Complete job',base+'/complete','POST',{})
 invoice=app('Create invoice',base+'/invoice','POST',{})['id']
 assert app('Invoice retry reuses same invoice',base+'/invoice','POST',{})['id']==invoice
 inv=app('Read invoice','/mobile/v1/invoices/'+invoice)['item'];assert inv['total_amount']==276
 pdf=app('Generate invoice PDF','/invoices/'+invoice+'/pdf');assert pdf[:5]==b'%PDF-';(root/'invoice-fixture.pdf').write_bytes(pdf)
 app('Mark invoice paid','/mobile/v1/invoices/'+invoice+'/paid','POST',{})
 assert app('Reload paid invoice','/mobile/v1/invoices/'+invoice)['item']['status']=='paid'
 app('Reject repeated paid operation','/mobile/v1/invoices/'+invoice+'/paid','POST',{},expected=400)
 app('Require explicit deletion confirmation','/account/delete','POST',{},expected=400)
 app('Delete disposable account','/account/delete','POST',{'confirm':'DELETE'})
 call('Deleted login rejected','/auth/v1/user',expected=403)
 for table,key in [('profiles','id'),('quotes','user_id'),('invoices','user_id'),('subscriptions','user_id')]:assert not rest('No remaining '+table,table+'?'+key+'=eq.'+user+'&select='+key)
 call('Deleted logo inaccessible','/storage/v1/object/public/business-logos/'+logo['logoUrl'].split('/business-logos/')[1],anonymous=True,expected=400)
 for bucket in ['business-logos','quote-attachments']:
  listing=call('No remaining '+bucket,'/storage/v1/object/list/'+bucket,'POST',{'prefix':user,'limit':100},service=True);assert not listing
 print(json.dumps({'passed':True,'checks':len(results),'scope':'isolated storage, PDFs, lifecycle/invoice, real account deletion; delivery excluded'}))
except Exception as e:
 print(json.dumps({'passed':False,'checks':len(results),'error':str(e)}))
 raise
finally:(root/'documents-deletion-results.json').write_text(json.dumps(results,indent=2))

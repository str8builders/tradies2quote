import http from 'node:http';
import https from 'node:https';

/** A task-local origin that can lose its upstream connection without changing
 * WebKit's network-emulation state (which can reject service-worker navigation).
 * No application responses are fabricated: online bytes come from the candidate.
 */
export async function planTestOrigin(base){
 const upstream=new URL(base),sockets=new Set();let offline=false,blocked=0,forwarded=0;
 const server=http.createServer((incoming,outgoing)=>{
  if(offline){blocked++;incoming.socket.destroy();return;}
  forwarded++;
  const target=new URL(incoming.url,upstream);
  const request=(target.protocol==='https:'?https:http).request(target,{method:incoming.method,headers:{...incoming.headers,host:target.host}},response=>{
   outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
  });
  request.on('error',()=>outgoing.destroy());incoming.pipe(request);
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {
  origin:`http://127.0.0.1:${server.address().port}`,
  disconnect(){offline=true;for(const socket of sockets)socket.destroy();return forwarded;},
  reconnect(){offline=false;},
  stats:()=>({blocked,forwarded}),
  async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
 };
}

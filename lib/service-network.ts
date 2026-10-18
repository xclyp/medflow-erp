import type { Outgoing, System } from './contracts.ts';
export type Peers=Partial<Record<System,{url:string;gateToken?:string}>>;
export type Delivery={id:string;ok:boolean;error:string};
export async function deliverMessages(messages:Outgoing[],peers:Peers,key:string):Promise<Delivery[]> {
 const results:Delivery[]=[];
 for(const m of messages.filter(x=>x.status!=='sent').slice(0,25)){
  const peer=peers[m.target];
  if(!peer){results.push({id:m.id,ok:false,error:'目标系统尚未配置访问地址'});continue;}
  try{
   const url=new URL('/api/integration/inbox',peer.url);
   if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('服务地址必须使用HTTPS');
   const {status,attempts,error,sentAt,...envelope}=m;
   const response=await fetch(url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`,...(peer.gateToken?{'OAI-Sites-Authorization':`Bearer ${peer.gateToken}`}:{})},body:JSON.stringify(envelope),signal:AbortSignal.timeout(10000)});
   const body=await response.json().catch(()=>({})) as {accepted?:boolean;messageId?:string;error?:string};
   if(!response.ok||body.accepted!==true||body.messageId!==m.id)throw Error(body.error||`目标系统未确认接收（HTTP ${response.status}）`);
   results.push({id:m.id,ok:true,error:''});
  }catch(e){results.push({id:m.id,ok:false,error:(e instanceof Error?e.message:'网络投递失败').slice(0,400)});}
 }
 return results;
}

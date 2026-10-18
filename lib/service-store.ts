import type {Domain,DomainState,Envelope,Command,Context,Outgoing,Row,System} from './contracts.ts';
import {BusinessError,requireValue} from './contracts.ts';
export interface Snapshot {state:DomainState;version:number;owner:string;token:string;inbox:Row[];requests:Row[];audit:Row[]}
export interface Store {read():Promise<Snapshot>;commit(before:Snapshot,next:Snapshot):Promise<boolean>}
export function canonical(v:unknown):string {if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;if(v&&typeof v==='object')return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(v)??'null'}
export function appStore(db:D1Database,domain:Domain):Store {
 const key=domain.system;
 return {
  async read(){
   const r=await db.batch<Record<string,unknown>>(['app_meta','app_records','app_outbox','app_inbox','app_requests','app_audit'].map(t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`)));
   const meta=r[0].results[0] as {id:string;owner:string;version:number;token:string;initialized:number;mode:'demo'|'empty'}|undefined;
   if(meta&&meta.id!==key)throw new BusinessError('数据库绑定了其他系统，已停止访问','WRONG_DATABASE',503);
   const state=domain.initial();state.initialized=!!meta?.initialized;state.mode=meta?.mode??'empty';
   for(const row of r[1].results){const c=String(row.collection);(state.collections[c]??=[]).push(JSON.parse(String(row.data)));}
   state.outbox=r[2].results.map(x=>JSON.parse(String(x.data)));
   return {state,version:meta?.version??0,owner:meta?.owner??'',token:meta?.token??'',inbox:r[3].results.map(x=>JSON.parse(String(x.data))),requests:r[4].results.map(x=>JSON.parse(String(x.data))),audit:r[5].results.map(x=>JSON.parse(String(x.data))).reverse()};
  },
  async commit(before,next){
   const token=crypto.randomUUID();const guard='EXISTS (SELECT 1 FROM app_meta WHERE id=? AND token=?)';
   const statements=[before.version?db.prepare('UPDATE app_meta SET version=version+1,token=?,owner=?,initialized=?,mode=? WHERE id=? AND version=?').bind(token,next.owner,Number(next.state.initialized),next.state.mode,key,before.version):db.prepare('INSERT OR IGNORE INTO app_meta(id,version,token,owner,initialized,mode) VALUES(?,1,?,?,?,?)').bind(key,token,next.owner,Number(next.state.initialized),next.state.mode)];
   type Entity={table:string;key:string;keys:string[];row:Record<string,string|number>};
   const entities=(s:Snapshot)=>{const list:Entity[]=[];const add=(table:string,keys:string[],row:Record<string,string|number>)=>list.push({table,keys,row,key:`${table}:${keys.map(k=>row[k]).join(':')}`});
    for(const [collection,rows] of Object.entries(s.state.collections))for(const row of rows)add('app_records',['collection','id'],{collection,id:row.id,status:String(row.status??''),reference:String(row.reference??row.code??''),data:JSON.stringify(row)});
    for(const row of s.state.outbox)add('app_outbox',['id'],{id:row.id,target:row.target,status:row.status,data:JSON.stringify(row)});
    for(const [table,rows] of [['app_inbox',s.inbox],['app_requests',s.requests],['app_audit',s.audit]] as const)for(const row of rows)add(table,['id'],{id:row.id,data:JSON.stringify(row)});
    return list;
   };
   const old=new Map(entities(before).map(x=>[x.key,x]));
   for(const row of entities(next)){const prev=old.get(row.key);old.delete(row.key);if(prev&&canonical(prev.row)===canonical(row.row))continue;const cols=Object.keys(row.row);statements.push(db.prepare(`INSERT INTO ${row.table}(${cols.join(',')}) SELECT ${cols.map(()=>'?').join(',')} WHERE ${guard} ON CONFLICT(${row.keys.join(',')}) DO UPDATE SET ${cols.filter(x=>!row.keys.includes(x)).map(x=>`${x}=excluded.${x}`).join(',')}`).bind(...cols.map(x=>row.row[x]),key,token));}
   for(const row of old.values())statements.push(db.prepare(`DELETE FROM ${row.table} WHERE ${row.keys.map(k=>`${k}=?`).join(' AND ')} AND ${guard}`).bind(...row.keys.map(x=>row.row[x]),key,token));
   const result=await db.batch(statements);return result[0].meta.changes===1;
  }
 };
}
function context(state:DomainState,source:System,actor:string,now:string):Context {return {actor,now,emit(target,type,payload,correlationId){state.outbox.push({id:crypto.randomUUID(),source,target,type,payload,correlationId:correlationId??String(payload.orderId??payload.purchaseId??payload.taskId??payload.billId??''),at:now,status:'pending',attempts:0,error:''})}}}
function authorize(s:Snapshot,actor:string){if(s.owner&&s.owner!==actor)throw new BusinessError('当前账号不是此独立应用的数据管理员','FORBIDDEN',403)}
function auditChanges(before:DomainState,after:DomainState){const changes:unknown[]=[];for(const [collection,rows]of Object.entries(after.collections)){const prev=new Map((before.collections[collection]??[]).map(x=>[x.id,x]));for(const r of rows){if(canonical(prev.get(r.id))!==canonical(r))changes.push({collection,id:r.id,before:prev.get(r.id)??null,after:r});prev.delete(r.id);}for(const r of prev.values())changes.push({collection,id:r.id,before:r,after:null});}return changes;}
export async function readApp(store:Store,actor:string){const s=await store.read();authorize(s,actor);return view(s,actor)}
function view(s:Snapshot,actor:string,notice?:string){return {state:s.state,version:s.version,me:{id:actor},inbox:s.inbox.map(({fingerprint,...x})=>x),audit:s.audit,...(notice?{notice}:{})}}
export async function executeApp(store:Store,domain:Domain,cmd:Command,actor:string,at=new Date().toISOString()){
 requireValue(typeof cmd.requestId==='string'&&cmd.requestId.length>=8&&cmd.requestId.length<=180,'请求号无效');
 const fp=canonical(cmd);
 for(let i=0;i<12;i++){
  const before=await store.read();authorize(before,actor);const prior=before.requests.find(x=>x.id===cmd.requestId);
  if(prior){requireValue(prior.fingerprint===fp,'请求号已被其他内容使用','IDEMPOTENCY_CONFLICT');return view(before,actor,String(prior.notice));}
  const next=structuredClone(before);if(!next.owner)next.owner=actor;
  const notice=domain.apply(next.state,cmd,context(next.state,domain.system,actor,at));
  next.requests.push({id:cmd.requestId,fingerprint:fp,notice,at,actor});next.audit.unshift({id:crypto.randomUUID(),actor,action:cmd.action,at,requestId:cmd.requestId,changes:auditChanges(before.state,next.state)});
  if(await store.commit(before,next)){next.version=before.version+1;return view(next,actor,notice);}
 }
 throw new BusinessError('并发写入繁忙，请使用原请求号重试','BUSY');
}
export function validateEnvelope(e:Envelope,target:System){requireValue(e&&typeof e==='object'&&!Array.isArray(e),'消息格式无效');requireValue(['oms','wms','erp','bms','tms','wcs'].includes(e.source)&&e.source!==target&&e.target===target,'消息来源或目标无效');requireValue(typeof e.id==='string'&&e.id.length>=8&&e.id.length<=180,'消息号无效');requireValue(typeof e.type==='string'&&e.type.length<=100&&typeof e.correlationId==='string'&&typeof e.at==='string'&&Number.isFinite(Date.parse(e.at)),'消息头无效');requireValue(e.payload&&typeof e.payload==='object'&&!Array.isArray(e.payload),'消息内容无效');}
export async function receiveApp(store:Store,domain:Domain,e:Envelope,at=new Date().toISOString()){
 validateEnvelope(e,domain.system);const fp=canonical(e);
 for(let i=0;i<12;i++){
  const before=await store.read();requireValue(before.state.initialized,'目标系统尚未初始化','NOT_INITIALIZED');
  const prior=before.inbox.find(x=>x.id===e.id);if(prior){requireValue(prior.fingerprint===fp,'消息号已被其他内容使用','IDEMPOTENCY_CONFLICT');return {accepted:true,messageId:e.id,duplicate:true};}
  const next=structuredClone(before);const notice=domain.receive(next.state,e,context(next.state,domain.system,`service:${e.source}`,at));
  next.inbox.push({id:e.id,fingerprint:fp,source:e.source,type:e.type,correlationId:e.correlationId,at,notice});next.audit.unshift({id:crypto.randomUUID(),actor:`service:${e.source}`,action:e.type,at,requestId:e.id,changes:auditChanges(before.state,next.state)});
  if(await store.commit(before,next))return {accepted:true,messageId:e.id,duplicate:false};
 }
 throw new BusinessError('消息接收并发繁忙','BUSY');
}
export async function updateDeliveries(store:Store,actor:string,results:{id:string;ok:boolean;error:string}[],at=new Date().toISOString()){
 for(let i=0;i<12;i++){const before=await store.read();authorize(before,actor);const next=structuredClone(before);for(const result of results){const m=next.state.outbox.find(x=>x.id===result.id);if(!m||m.status==='sent')continue;m.attempts++;m.error=result.error;m.status=result.ok?'sent':'failed';if(result.ok)m.sentAt=at;}next.audit.unshift({id:crypto.randomUUID(),actor,action:'integration.dispatch',at,changes:results});if(await store.commit(before,next)){next.version=before.version+1;return view(next,actor,`已确认${results.filter(x=>x.ok).length}条，失败${results.filter(x=>!x.ok).length}条`);}}
 throw new BusinessError('投递状态记录繁忙，收件方支持消息幂等可重试','BUSY');
}

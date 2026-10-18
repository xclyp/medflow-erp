import {env} from 'cloudflare:workers';
import domain from './domain';
import {BusinessError} from './contracts';
import type {Command,Envelope} from './contracts';
import {appStore,readApp,executeApp,receiveApp,updateDeliveries} from './service-store';
import {deliverMessages} from './service-network';
import type {Peers} from './service-network';
const bindings=env as unknown as Record<string,unknown>;
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function identity(r:Request){const email=r.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();const id=r.headers.get('oai-authenticated-user-id')?.trim();if(email&&email.length<254)return `email:${email}`;if(id&&id.length<=180)return id;throw new BusinessError('请先登录后访问此独立系统','UNAUTHENTICATED',401)}
const store=()=>{if(!bindings.DB)throw new BusinessError('独立数据库未绑定','STORAGE_UNAVAILABLE',503);return appStore(bindings.DB as D1Database,domain)};
async function body(r:Request){if(!r.headers.get('content-type')?.startsWith('application/json'))throw new BusinessError('请使用JSON请求','INVALID_JSON',400);const text=await r.text();if(new TextEncoder().encode(text).length>131072)throw new BusinessError('请求过大','TOO_LARGE',413);try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new BusinessError('JSON格式无效','INVALID_JSON',400)}}
function origin(r:Request){if(r.headers.get('origin')!==new URL(r.url).origin)throw new BusinessError('写入必须来自当前系统页面','ORIGIN_REJECTED',403)}
export function error(e:unknown){if(e instanceof BusinessError)return json({error:e.message,code:e.code},e.status);console.error(`${domain.system} request failed`,e);return json({error:'操作未完成，请核对数据并使用原请求号重试',code:'INTERNAL'},500)}
export async function read(r:Request){try{return json({...await readApp(store(),identity(r)),system:domain.system.toUpperCase()})}catch(e){return error(e)}}
export async function write(r:Request){try{const actor=identity(r);origin(r);return json({...await executeApp(store(),domain,await body(r) as Command,actor),system:domain.system.toUpperCase()})}catch(e){return error(e)}}
export async function inbox(r:Request){try{const key=String(bindings.INTEGRATION_KEY??'');if(key.length<32||r.headers.get('authorization')!==`Bearer ${key}`)throw new BusinessError('服务凭据无效','SERVICE_UNAUTHORIZED',401);return json(await receiveApp(store(),domain,await body(r) as Envelope));}catch(e){return error(e)}}
function peers():Peers{try{return JSON.parse(String(bindings.PEERS_JSON??'{}'))}catch{throw new BusinessError('服务地址配置无效','CONFIG_INVALID',503)}}
export async function integration(r:Request){try{const actor=identity(r);const result=await readApp(store(),actor);return json({system:domain.system.toUpperCase(),peers:Object.entries(peers()).map(([system,p])=>({system,url:p?.url,configured:true})),outbox:result.state.outbox,inbox:result.inbox,serviceConfigured:String(bindings.INTEGRATION_KEY??'').length>=32})}catch(e){return error(e)}}
export async function dispatch(r:Request){try{const actor=identity(r);origin(r);const db=store();const state=await readApp(db,actor);const key=String(bindings.INTEGRATION_KEY??'');if(key.length<32)throw new BusinessError('服务凭据尚未配置','CONFIG_MISSING',503);const results=await deliverMessages(state.state.outbox,peers(),key);return json(await updateDeliveries(db,actor,results));}catch(e){return error(e)}}

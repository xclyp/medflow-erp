export type System = 'oms'|'erp'|'bms'|'tms'|'wcs'|'wms';
export type Row = {id:string; [key:string]:unknown};
export interface Envelope {id:string;source:System;target:System;type:string;correlationId:string;at:string;payload:Record<string,unknown>}
export interface Outgoing extends Envelope {status:'pending'|'sent'|'failed';attempts:number;error:string;sentAt?:string}
export interface DomainState {initialized:boolean;mode:'empty'|'demo';collections:Record<string,Row[]>;outbox:Outgoing[]}
export interface Context {actor:string;now:string;emit:(target:System,type:string,payload:Record<string,unknown>,correlationId?:string)=>void}
export interface Command {action:string;requestId:string;[key:string]:unknown}
export interface Domain {system:System;initial:()=>DomainState;apply:(s:DomainState,c:Command,x:Context)=>string;receive:(s:DomainState,e:Envelope,x:Context)=>string}
export class BusinessError extends Error {code:string;status:number;constructor(message:string,code='VALIDATION',status=409){super(message);this.code=code;this.status=status}}
export function requireValue(condition:unknown,message:string,code='VALIDATION'):asserts condition {if(!condition)throw new BusinessError(message,code)}
export function textValue(v:unknown,label:string,max=160){requireValue(typeof v==='string'&&v.trim().length>0&&v.trim().length<=max,`${label}不能为空且最长${max}字`);return v.trim()}
export function integer(v:unknown,label:string,min=1,max=1000000000){const n=typeof v==='number'?v:Number(v);requireValue(Number.isSafeInteger(n)&&n>=min&&n<=max,`${label}须为${min}至${max}的整数`);return n}
export function find(s:DomainState,collection:string,id:unknown){const row=s.collections[collection]?.find(r=>r.id===id);requireValue(row,'记录不存在','NOT_FOUND');return row}
export function uid(prefix=''){return `${prefix}${crypto.randomUUID()}`}
export type Column={key:string;label:string;format?:'money'|'time'|'status'|'json'};
export type Field={name:string;label:string;type?:'text'|'number'|'date'|'textarea'|'select'|'checkbox';required?:boolean;default?:string|number|boolean;options?:{value:string;label:string}[];collection?:string;labelKey?:string;hint?:string;min?:number;step?:number};
export type Operation={action:string;label:string;fields:Field[];row?:boolean;danger?:boolean;description?:string};
export type PageConfig={id:string;title:string;description:string;collection:string;columns:Column[];operations?:Operation[]};
export interface AppConfig {system:System;name:string;tagline:string;accent:string;pages:PageConfig[]}

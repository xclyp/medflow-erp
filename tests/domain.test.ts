import test from 'node:test';
import assert from 'node:assert/strict';
import erp from '../lib/domain.ts';
import bms from '../lib/domain.ts';
import wcs from '../lib/domain.ts';
import type {Domain,DomainState,Envelope,Command,Context} from '../lib/contracts.ts';

function harness(domain:Domain){
 let state=domain.initial();let sequence=0;const emitted:Envelope[]=[];
 function invoke(kind:'apply'|'receive',input:Command|Envelope){const draft=structuredClone(state);const pending:Envelope[]=[];const context:Context={actor:'test-operator',now:'2026-10-18T04:00:00.000Z',emit:(target,type,payload,correlationId='')=>pending.push({id:`event-${domain.system}-${++sequence}`,source:domain.system,target,type,correlationId,at:'2026-10-18T04:00:00.000Z',payload})};const notice=kind==='apply'?domain.apply(draft,input as Command,context):domain.receive(draft,input as Envelope,context);state=draft;emitted.push(...pending);return notice;}
 return {get state(){return state;},emitted,do:(action:string,fields:Record<string,unknown>={})=>invoke('apply',{action,requestId:`request-${++sequence}`,...fields}),receive:(e:Envelope)=>invoke('receive',e)};
}
function message(source:Envelope['source'],target:Envelope['target'],type:string,payload:Record<string,unknown>,id=crypto.randomUUID()):Envelope{return {id,source,target,type,correlationId:'test-flow',at:'2026-10-18T04:00:00.000Z',payload};}
const first=(s:DomainState,k:string)=>s.collections[k][0];

test('ERP multi-line purchase requires approval and supports bounded staged ASN',()=>{
 const h=harness(erp);h.do('system.init',{demo:true});h.do('purchase.create',{reference:'PO-1',supplierId:'SUP-DEMO',lines:JSON.stringify([{productId:'P001',quantity:100,unitCostCents:1000}])});const po=first(h.state,'purchases'),line=first(h.state,'purchaseLines');const plan={lineId:line.id,reference:'ASN-1',quantity:40,batch:'BATCH-1',productionDate:'2026-10-01',expiryDate:'2027-10-01'};
 assert.throws(()=>h.do('purchase.receipt',plan),/审核/);h.do('purchase.approve',{id:po.id});h.do('purchase.receipt',plan);assert.equal(h.emitted.at(-1)?.type,'erp.receipt.expected');assert.equal(first(h.state,'purchaseLines').planned,40);assert.equal(h.state.collections.payables.length,0);assert.throws(()=>h.do('purchase.receipt',{...plan,reference:'ASN-TOO-MUCH',quantity:61}),/超过/);h.do('purchase.receipt',{...plan,reference:'ASN-2',quantity:60});assert.equal(h.state.collections.receipts.length,2);assert.throws(()=>h.do('purchase.create',{reference:'PO-1',supplierId:'SUP-DEMO',lines:[{productId:'P001',quantity:1,unitCostCents:1}]}),/存在/);
});
test('ERP accounts payable is based only on actual WMS receipts and is not double booked',()=>{
 const h=harness(erp);h.do('system.init',{demo:true});h.do('purchase.create',{reference:'PO-2',supplierId:'SUP-DEMO',lines:[{productId:'P001',quantity:100,unitCostCents:1000}]});const po=first(h.state,'purchases');h.do('purchase.approve',{id:po.id});h.do('purchase.receipt',{lineId:first(h.state,'purchaseLines').id,reference:'ASN-3',quantity:100,batch:'B',productionDate:'2026-10-01',expiryDate:'2027-10-01'});const receipt=first(h.state,'receipts');const received={purchaseId:po.id,receiptId:receipt.id,inboundId:'RK-1',quantity:20,productId:'P001',batch:'B'};
 h.receive(message('wms','erp','wms.inbound.stored',received));assert.equal(first(h.state,'payables').amountCents,20000);h.receive(message('wms','erp','wms.inbound.stored',received));assert.equal(first(h.state,'payables').amountCents,20000);assert.equal(h.state.collections.vouchers.length,1);assert.throws(()=>h.receive(message('wms','erp','wms.inbound.stored',{...received,quantity:21})),/冲突/);assert.throws(()=>h.do('payable.pay',{id:first(h.state,'payables').id,reference:'PAY-OVER',amountCents:20001}),/超过/);
 h.do('payable.pay',{id:first(h.state,'payables').id,reference:'PAY-1',amountCents:10000});h.do('payable.pay',{id:first(h.state,'payables').id,reference:'PAY-2',amountCents:10000});assert.equal(first(h.state,'payables').status,'paid');assert.throws(()=>h.do('payable.pay',{id:first(h.state,'payables').id,reference:'PAY-2',amountCents:1}),/超过|存在/);for(const voucher of h.state.collections.vouchers)assert.equal(voucher.debitCents,voucher.creditCents);
});
test('ERP manual vouchers reject imbalance and nonexistent accounts',()=>{
 const h=harness(erp);h.do('system.init',{demo:false});assert.throws(()=>h.do('voucher.post',{reference:'V-1',lines:[{accountId:'A-1002',debitCents:100,creditCents:0},{accountId:'A-2202',debitCents:0,creditCents:99}]}),/平衡/);assert.equal(h.state.collections.vouchers.length,0);assert.throws(()=>h.do('voucher.post',{reference:'V-2',lines:[{accountId:'NO-ACCOUNT',debitCents:1,creditCents:0}]}),/不存在/);h.do('voucher.post',{reference:'V-3',lines:[{accountId:'A-1002',debitCents:100,creditCents:0},{accountId:'A-2202',debitCents:0,creditCents:100}]});assert.equal(h.state.collections.voucherLines.length,2);
});
test('ERP local sale prices and full outbound reconciliation prevent invented or incomplete receivables',()=>{
 const h=harness(erp);h.do('system.init',{demo:true});const payload={orderId:'OMS-1',reference:'ORDER-1',outboundId:'CK-2',productId:'P001',quantity:2,customer:'医院',allShipped:true};h.receive(message('wms','erp','wms.outbound.shipped',payload));assert.throws(()=>h.do('sale.invoice',{orderId:'OMS-1',reference:'AR-1',expectedOutboundIds:['CK-1','CK-2']}),/收齐/);h.receive(message('wms','erp','wms.outbound.shipped',{...payload,outboundId:'CK-1',quantity:3,allShipped:false}));h.do('sale.invoice',{orderId:'OMS-1',reference:'AR-1',expectedOutboundIds:['CK-1','CK-2']});assert.equal(first(h.state,'receivables').amountCents,7500);assert.equal(first(h.state,'receivables').kind,'goods');assert.throws(()=>h.do('sale.invoice',{orderId:'OMS-1',reference:'AR-2',expectedOutboundIds:['CK-1','CK-2']}),/已登记/);h.do('receivable.collect',{id:first(h.state,'receivables').id,reference:'GOODS-CASH-1',amountCents:2500});assert.equal(first(h.state,'receivables').paidCents,2500);
});
test('ERP product publication queues messages without writing to other system collections',()=>{
 const h=harness(erp);h.do('system.init',{demo:true});h.do('product.publish',{id:'P001'});assert.deepEqual(h.emitted.map(e=>e.target),['oms','wms']);assert.ok(h.emitted.every(e=>e.type==='master.product.upsert'));assert.equal(h.state.collections.orders,undefined);
});
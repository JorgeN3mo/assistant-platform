import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store, cleanExtraction} from './store.mjs';
import {extractionPrompt} from './extract.mjs';
import {renderReport} from './reports.mjs';
import {Controller} from './controller.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'liq-report-')),mediaRoot=path.join(root,'media');fs.mkdirSync(mediaRoot);
  fs.writeFileSync(path.join(root,'report-users.json'),JSON.stringify({'101':'Comercial de Prueba García'}),{mode:0o640});
  const store=new Store(root);t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});let seq=0;
  function invoice({company='DIBOS',base='117.02',payment='efectivo',amount='141.59'}={}){
    const n=String(++seq),bytes=Buffer.from('%PDF-1.4 test '+n);
    let r=store.receive('101',[n],{hash:n,mime:'application/pdf',ext:'pdf',bytes}).invoice;
    const fields={empresa:company,numero:'1/2026 '+n.padStart(4,'0'),fecha_factura:'2026-10-09',codigo_cliente:n,cliente:'Cliente de prueba '+n,importe:amount,base_comision:base};
    for(const [field,value] of Object.entries(fields))r=store.change('101',r.id,r.revision,'edit',{field,value});
    r=store.change('101',r.id,r.revision,'payment',payment);
    if(payment==='pagare')for(const [field,value] of Object.entries({banco:'Banco de prueba',vencimiento:'2026-12-31'}))r=store.change('101',r.id,r.revision,'edit',{field,value});
    if(payment==='transferencia')r=store.change('101',r.id,r.revision,'edit',{field:'fecha_transferencia',value:'2026-10-09'});
    return store.change('101',r.id,r.revision,'confirm');
  }
  return {root,mediaRoot,store,invoice,close:r=>store.closeBatch('101',r.batch.id,store.batch('101',r.batch.id).revision)};
}
test('tax base is extracted separately from total and missing or invalid bases are never guessed',()=>{
 const prompt=extractionPrompt();assert.match(prompt,/base imponible total/);assert.match(prompt,/No calcules la base dividiendo/);
 const raw={principal_clara:true,base_comision:'117,02',importe:'141.59'};
 assert.equal(cleanExtraction(raw).data.base_comision,'117.02');assert.equal(cleanExtraction({...raw,base_comision:undefined}).data.base_comision,null);
 for(const value of ['-10','12.345','NaN'])assert.equal(cleanExtraction({...raw,base_comision:value}).data.base_comision,null);
 assert.equal(cleanExtraction({...raw,base_comision:'0'}).data.base_comision,'0.00');
 assert.equal(cleanExtraction({...raw,principal_clara:false}).data.base_comision,null);
});
test('close freezes names, color, rows and exact per-invoice commission; later config cannot change report',t=>{
 const f=fixture(t);let r=f.invoice({base:'44.50',payment:'transferencia',amount:'53.85'});f.invoice({base:'0.00',payment:'tarjeta'});f.close(r);
 const snap=f.store.reportSnapshot('101',r.batch.id);assert.equal(snap.rows[0].commission_cents,134);assert.equal(snap.rows[1].commission_cents,0);
 assert.equal(snap.rows[0].date,'2026-10-09');assert.equal(snap.rows[0].bank,'');assert.equal(snap.rows[0].number_short,'0001');
 assert.equal(snap.totals.commission_cents,134);assert.equal(snap.totals.transferencia,5385);assert.equal(snap.totals.tarjeta,14159);
 fs.writeFileSync(path.join(f.root,'report-users.json'),JSON.stringify({'101':'Otro nombre'}));assert.deepEqual(f.store.reportSnapshot('101',r.batch.id),snap);
 assert.throws(()=>f.store.reportSnapshot('102',r.batch.id),/tu usuario/);
});
test('missing name or base cannot create a partial closure; legacy closed lists require review',t=>{
 const f=fixture(t),r=f.invoice();fs.unlinkSync(path.join(f.root,'report-users.json'));assert.throws(()=>f.close(r),/nombre completo/);
 assert.equal(f.store.batch('101',r.batch.id).state,'abierta');assert.equal(f.store.db.prepare('SELECT count(*) n FROM closure_reports').get().n,0);
 f.store.db.prepare("UPDATE batches SET state='cerrada',version=1 WHERE id=?").run(r.batch.id);
 assert.throws(()=>f.store.reportSnapshot('101',r.batch.id),/anterior/);
 const other=f.invoice();f.store.db.prepare("UPDATE invoices SET data=json_remove(data,'$.base_comision') WHERE id=?").run(other.id);assert.throws(()=>f.close(other),/incompletos/);
});
test('PDF is private and cached; reopen removes download and prevents async stale export, new close creates version',async t=>{
 const f=fixture(t),r=f.invoice();let b=f.close(r),calls=0;
 const renderer=async()=>{calls++;return Buffer.from('%PDF-1.4 test');};
 const pdf=await f.store.exportPDF('101',b.id,f.mediaRoot,renderer);assert.equal(fs.statSync(pdf).mode&0o777,0o600);
 assert.equal(await f.store.exportPDF('101',b.id,f.mediaRoot,renderer),pdf);assert.equal(calls,1);
 f.store.reopenBatch('101',b.id,b.revision);assert.equal(fs.existsSync(pdf),false);await assert.rejects(f.store.exportPDF('101',b.id,f.mediaRoot,renderer),/Cierra/);
 let row=f.store.get('101',r.id);row=f.store.change('101',row.id,row.revision,'edit',{field:'base_comision',value:'100'});row=f.store.change('101',row.id,row.revision,'confirm');b=f.close(row);
 assert.equal(b.version,2);assert.equal(f.store.reportSnapshot('101',b.id).totals.commission_cents,300);assert.equal(f.store.db.prepare('SELECT count(*) n FROM closure_reports').get().n,2);
 let resolve;const pending=f.store.exportPDF('101',b.id,f.mediaRoot,()=>new Promise(r=>resolve=r));f.store.reopenBatch('101',b.id,b.revision);resolve(Buffer.from('%PDF-1.4 test'));
 await assert.rejects(pending,/ha cambiado/);assert.ok(!fs.readdirSync(path.dirname(pdf)).some(n=>n.endsWith('.pdf')));
});
test('renderer failures preserve closed data; print callback uses document dispatch and rejects foreign owner',async t=>{
 const f=fixture(t),r=f.invoice(),b=f.close(r),policy={dmPolicy:'allowlist',allowFrom:['101','102']};
 const c=new Controller({config:()=>({channels:{telegram:{...policy,accounts:{liki:{...policy}}}}}),options:{dataDir:f.root,mediaRoot:f.mediaRoot},renderer:async()=>{throw new Error('test renderer failure');}});
 t.after(()=>c.close());const buttons=c.batchSheet('101',b.id).buttons.flat();assert.ok(buttons.some(b=>b.text==='Imprimir'));
 const data=buttons.find(b=>b.text==='Imprimir').callback_data;
 assert.deepEqual(await c.callback({account:'liki',sender:'101',isGroup:false,data}),{submitText:`/imprimir ${b.id}`});
 await assert.rejects(c.callback({account:'liki',sender:'102',isGroup:false,data}),/tu usuario/);
 await assert.rejects(c.incoming({account:'liki',sender:'101',isGroup:false,messageId:'p',text:`/imprimir ${b.id}`}),/renderer failure/);
 assert.equal(f.store.batch('101',b.id).state,'cerrada');assert.equal(c.activePrints,0);
 c.renderer=async()=>Buffer.from('%PDF-1.4 test');const replies=await c.incoming({account:'liki',sender:'101',isGroup:false,messageId:'p2',text:`/imprimir ${b.id}`});assert.match(replies[0].mediaUrl,/\.pdf$/);
});
test('real PDF renderer supports all company templates and multiple pages',async t=>{
 const f=fixture(t);for(const company of ['DIBOS','REDISSA','REDISSA & DIBOS']){
  const r=f.invoice({company,payment:'pagare'});f.close(r);const snapshot=f.store.reportSnapshot('101',r.batch.id);
  if(company==='REDISSA & DIBOS')snapshot.rows=Array.from({length:80},(_,n)=>({...snapshot.rows[0],client:'Cliente con nombre largo & caracteres <especiales> García '+n}));
  const pdf=await renderReport(snapshot,process.env.LIQUIDATOR_TEST_PYTHON||'/usr/bin/python3');assert.ok(pdf.length>1500);assert.match(pdf.subarray(0,8).toString(),/^%PDF-/);
 }
});

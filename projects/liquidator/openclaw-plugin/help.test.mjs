import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Controller} from './controller.mjs';
import {Store} from './store.mjs';
import {assist,validateHelp,helpPrompt,OUTSIDE} from './help.mjs';
import {catalog} from './catalog.mjs';
const cfg={agents:{entries:{liki:{model:{primary:'openai/gpt-6-luna@openai:test'}}}},channels:{telegram:{dmPolicy:'allowlist',allowFrom:['101','102'],accounts:{liki:{dmPolicy:'allowlist',allowFrom:['101','102']}}}}};
function fixture(t,helper){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liq-help-'));const c=new Controller({config:()=>structuredClone(cfg),options:{dataDir:root},helper});
 t.after(()=>{c.close();fs.rmSync(root,{recursive:true,force:true});});
 let seq=0;return {root,c,ask:(text,sender='101')=>c.incoming({account:'liki',sender,isGroup:false,text,messageId:'h'+(++seq),media:[]})};
}
const answer=(text='Abre /ver 9072 D y pulsa Corregir.')=>({dentro_alcance:true,temas:['corregir_factura'],respuesta:text});
function runtime(result,meta={provider:'openai',model:'gpt-6-luna'},observe=()=>{}){
 return {agent:{resolveAgentDir:()=>'/unused',runEmbeddedAgent:async p=>{observe(p);return {meta:{durationMs:100,agentMeta:{...meta,usage:{input:100,output:20,total:120}}},payloads:[{text:JSON.stringify(result)}]};}}};
}
test('Luna writes its own answer with a bounded manual and history, no tools or model fallback',async()=>{
 let observed,usage;const text='No tienes que borrarla: cambia a Transferencia, indica la fecha y vuelve a aceptarla.';
 const r=await assist(runtime(answer(text),undefined,p=>observed=p),cfg,'Puse efectivo por error',{history:[{question:'Cómo cambio el cobro',response:'Abre la ficha.'}],onUsage:u=>usage=u});
 assert.equal(r.text,text);assert.equal(r.remember,true);assert.equal(observed.disableTools,true);assert.equal(observed.disableMessageTool,true);assert.equal(observed.thinkLevel,'low');assert.deepEqual(observed.modelFallbacksOverride,[]);assert.equal(observed.streamParams.maxTokens,512);
 assert.match(observed.prompt,/Cómo cambio el cobro/);assert.match(observed.prompt,/MANUAL AUTORIZADO/);assert.equal(observed.images,undefined);assert.equal(usage.model,'gpt-6-luna');assert.equal(usage.total,120);
});
test('unknown model, provider or absent runtime attestation fail closed without a second call',async()=>{
 for(const meta of [{provider:'openai',model:'other'},{provider:'other',model:'gpt-6-luna'},{}]){
  let calls=0;await assert.rejects(assist(runtime(answer(),meta,()=>calls++),cfg,'ayudame'),/policy mismatch/);assert.equal(calls,1);
 }
 let calls=0;const wrong=structuredClone(cfg);wrong.agents.entries.liki.model.primary='openai/other';await assert.rejects(assist(runtime(answer(),undefined,()=>calls++),wrong,'ayudame'),/policy missing/);assert.equal(calls,0);
});
test('out-of-scope text, nonexistent commands, links and invalid responses never reach the user',()=>{
 assert.deepEqual(validateHelp({dentro_alcance:false,respuesta:'Aquí tienes tu poema'}),{text:OUTSIDE,remember:false});
 for(const bad of [answer('Ejecuta /shell'),answer('Usa /ver@otro_bot'),answer('Visita https://ejemplo.com'),answer('<script>'),answer('x'.repeat(1601)),{...answer(),temas:['inventado']},{temas:['corregir_factura'],respuesta:'texto'}])assert.throws(()=>validateHelp(bad));
 assert.equal(validateHelp(answer('Introduce la fecha en DD/MM/AAAA.')).remember,true);
 const fn=catalog.funciones.find(f=>f.id==='consultar_facturas');fn.habilitada=false;
 try{assert.throws(()=>validateHelp(answer('Usa /ver 9072 D.')));assert.ok(!helpPrompt('ayuda').includes('"id":"consultar_facturas"'));}finally{fn.habilitada=true;}
});
test('help context isolates users, persists, limits to three exchanges and expires',async t=>{
 const observed=[];const f=fixture(t,async(_r,_c,q,o)=>{observed.push({q,history:o.history});return {text:'Respuesta a '+q,remember:true};});
 await f.ask('primera');await f.ask('segunda');await f.ask('tercera');await f.ask('cuarta');assert.deepEqual(f.c.store.helpHistory('101').map(h=>h.question),['segunda','tercera','cuarta']);
 await f.ask('otro usuario','102');assert.deepEqual(observed.at(-1).history,[]);
 f.c.close();f.c.storeValue=null;assert.equal(f.c.store.helpHistory('101').length,3);
 f.c.store.db.prepare('UPDATE help_context SET at=? WHERE owner=?').run(new Date(Date.now()-16*60000).toISOString(),'101');assert.deepEqual(f.c.store.helpHistory('101'),[]);assert.equal(f.c.store.helpHistory('102').length,1);
});
test('menu resets memory; out-of-scope and failed replies do not become conversational knowledge',async t=>{
 const f=fixture(t,async(_r,_c,q)=>{if(q==='error')throw new Error('provider');return {text:q,remember:q!=='ajeno'};});
 await f.ask('primera');await f.ask('ajeno');await f.ask('error');assert.equal(f.c.store.helpHistory('101').length,1);
 assert.deepEqual(f.c.store.db.prepare('SELECT status FROM help_calls ORDER BY rowid').all().map(r=>r.status),['answered','outside','failed']);
 await f.ask('/ayuda');assert.deepEqual(f.c.store.helpHistory('101'),[]);
});
test('simultaneous messages do not race history and reset during an in-flight call stays reset',async t=>{
 let finish,calls=0;const f=fixture(t,async()=>{calls++;return new Promise(r=>finish=r);});
 const pending=f.ask('primera');const busy=await f.ask('segunda');assert.match(busy[0].text,/ocupada/);assert.equal(calls,1);
 await f.ask('/ayuda');finish({text:'Respuesta anterior',remember:true});await pending;assert.deepEqual(f.c.store.helpHistory('101'),[]);
});
test('global reservation is persistent across stores, includes in-flight/error calls and does not consume per-user budget on rejection',t=>{
 const f=fixture(t),s=f.c.store;
 for(let n=0;n<catalog.limites.ayuda_global_diaria-1;n++)s.db.prepare('INSERT INTO usage(owner,kind,at) VALUES (?,?,?)').run('999','help',new Date().toISOString());
 const reservation=s.helpStart('101','last');const second=new Store(f.root);
 try{assert.throws(()=>second.helpStart('102','blocked'),/global/);assert.equal(second.db.prepare("SELECT count(*) n FROM usage WHERE owner='102'").get().n,0);
  s.helpFinish('101',reservation.key,'Fallo',{status:'failed'});assert.throws(()=>second.helpStart('102','still-blocked'),/global/);
  assert.equal(second.helpStart('101','last').fresh,false);
 }finally{second.close();}
});
test('oversized question never reaches inference and prompt growth is bounded',async t=>{
 let calls=0;const f=fixture(t,async()=>{calls++;return {text:'ok',remember:true};});await f.ask('x'.repeat(601));assert.equal(calls,0);assert.equal(f.c.store.db.prepare("SELECT count(*) n FROM usage WHERE kind='help'").get().n,0);
 const history=Array.from({length:20},(_,n)=>({question:'Q'+n+'x'.repeat(600),response:'x'.repeat(1600)}));const prompt=helpPrompt('pregunta',history);assert.ok(prompt.length<=catalog.limites.contexto_caracteres);assert.doesNotMatch(prompt,/Q0x/);
});
test('usage telemetry is stored without prompts or credentials and unavailable counters remain null',async t=>{
 const f=fixture(t,async(_r,_c,_q,o)=>{o.onUsage({model:'gpt-6-luna',provider:'openai',input:100,output:20,total:120,durationMs:200});return {text:'Pulsa Corregir.',remember:true};});
 await f.ask('pregunta privada');const row=f.c.store.db.prepare('SELECT * FROM help_calls').get();assert.equal(row.total_tokens,120);assert.equal(row.cache_read,null);assert.equal(row.status,'answered');assert.ok(!JSON.stringify(row).includes('pregunta privada'));
});

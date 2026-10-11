import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConversationArchive} from './conversations.mjs';
import {Controller} from './controller.mjs';
import {UserError} from './store.mjs';
import {catalog} from './catalog.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liq-archive-'));let warnings=0;
 const logger={warn(){warnings++;}},archive=new ConversationArchive(root,{logger});
 t.after(async()=>{await archive.flush();fs.rmSync(root,{recursive:true,force:true});});
 return {root,archive,logger,warnings:()=>warnings};
}
const event={sender:'101',messageId:'one',question:'¿Cómo corrijo?\nMe equivoqué.',response:'Pulsa Corregir.',status:'answered',model:'gpt-6-luna',provider:'openai'};
const rows=a=>fs.readdirSync(a.directory).filter(n=>n.endsWith('.jsonl')).flatMap(n=>fs.readFileSync(path.join(a.directory,n),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)));
test('daily UTF-8 text captures only approved fields with private permissions and stable event identity',async t=>{
 const {archive}=fixture(t);archive.record({...event,invoice:{secret:'NOT_INCLUDED'},credential:'NOT_INCLUDED'});archive.record(event);await archive.flush();
 const r=rows(archive);assert.equal(r.length,2);assert.equal(r[0].pregunta,event.question);assert.equal(r[0].respuesta,event.response);assert.equal(r[0].usuario,'101');assert.equal(r[0].id,r[1].id);assert.equal(r[0].entrega,'no_verificada');assert.ok(!JSON.stringify(r).includes('NOT_INCLUDED'));
 assert.equal(fs.statSync(archive.directory).mode&0o777,0o700);assert.equal(fs.statSync(path.join(archive.directory,fs.readdirSync(archive.directory)[0])).mode&0o777,0o600);
});
test('retention keeps exactly 90 calendar dates including today, deletes only dated archive files and works when recording is disabled',async t=>{
 const {archive}=fixture(t),today=new Date('2026-10-11T12:00:00Z');const date=days=>new Date(today.getTime()-days*86400000);
 for(const age of [91,90,89,0]){archive.clock=()=>date(age);archive.record({...event,messageId:String(age)});await archive.flush();}
 fs.writeFileSync(path.join(archive.directory,'notes.txt'),'keep');fs.writeFileSync(path.join(archive.directory,'2026-02-30.jsonl'),'keep');
 archive.clock=()=>today;const previous=catalog.registro_conversaciones.habilitado;catalog.registro_conversaciones.habilitado=false;
 try{archive.cleanup();await archive.flush();}finally{catalog.registro_conversaciones.habilitado=previous;}
 const names=fs.readdirSync(archive.directory);assert.ok(!names.includes(date(90).toISOString().slice(0,10)+'.jsonl'));assert.ok(names.includes(date(89).toISOString().slice(0,10)+'.jsonl'));assert.ok(names.includes('2026-10-11.jsonl'));assert.ok(names.includes('notes.txt'));assert.ok(names.includes('2026-02-30.jsonl'));
});
test('symlink targets are never written or cleaned and archive errors remain nonfatal',async t=>{
 const f=fixture(t);fs.mkdirSync(f.archive.directory,{recursive:true});const target=path.join(f.root,'keep.txt');fs.writeFileSync(target,'private target');
 fs.symlinkSync(target,path.join(f.archive.directory,new Date().toISOString().slice(0,10)+'.jsonl'));fs.symlinkSync(target,path.join(f.archive.directory,'2000-01-01.jsonl'));
 assert.doesNotThrow(()=>f.archive.record(event));f.archive.cleanup();await f.archive.flush();assert.equal(fs.readFileSync(target,'utf8'),'private target');assert.ok(f.warnings()>0);
});
test('queue and daily byte caps bound disk and memory use; truncation is explicit',async t=>{
 const f=fixture(t);for(let n=0;n<110;n++)f.archive.record({...event,messageId:String(n)});assert.equal(f.archive.pending,100);await f.archive.flush();assert.equal(rows(f.archive).length,100);assert.ok(f.warnings()>0);
 f.archive.record({...event,question:'x'.repeat(1000),response:'y'.repeat(3000)});await f.archive.flush();const r=rows(f.archive).at(-1);assert.equal(r.pregunta.length,600);assert.equal(r.respuesta.length,2200);assert.equal(r.recortado,true);
 const previous=catalog.registro_conversaciones.max_bytes_dia;catalog.registro_conversaciones.max_bytes_dia=1;
 try{f.archive.record(event);await f.archive.flush();assert.equal(rows(f.archive).length,101);}finally{catalog.registro_conversaciones.max_bytes_dia=previous;}
});
function controller(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liq-conversation-'));
 const policy={dmPolicy:'allowlist',allowFrom:['101']};const cfg={channels:{telegram:{...policy,accounts:{liki:{...policy}}}}};let calls=0;
 const c=new Controller({config:()=>cfg,options:{dataDir:root},helper:async()=>{calls++;return {text:'Puedes usar los botones para corregir.',remember:true};}});
 t.after(async()=>{await c.close();fs.rmSync(root,{recursive:true,force:true});});
 let n=0;return {root,c,calls:()=>calls,ask:(text,extra={})=>c.incoming({account:'liki',sender:'101',isGroup:false,messageId:String(++n),text,media:[],...extra})};
}
test('conversation archive includes help, greetings and menu but excludes operational commands, media, edit values and unauthorized messages',async t=>{
 const f=controller(t);await f.ask('pregunta',{sender:'999'});await f.c.archive.flush();assert.equal(fs.existsSync(f.c.archive.directory),false);
 await f.ask('¿Cómo corrijo?');await f.ask('gracias');await f.ask('/ayuda');await f.ask('/d');await f.ask('caption excluded',{media:[{path:'/nonexistent.png'}]});
 f.c.store.pendingEdit=()=>({invoice_id:'unused',revision:1,field:'cliente'});f.c.store.change=()=>{throw new Error('test edit path');};await assert.rejects(f.ask('PRIVATE_INVOICE_CLIENT'),/test edit/);
 await f.c.archive.flush();assert.deepEqual(rows(f.c.archive).map(r=>r.resultado),['answered','greeting','menu']);assert.ok(!JSON.stringify(rows(f.c.archive)).includes('PRIVATE_INVOICE'));assert.equal(f.calls(),1);
});
test('blocked or failed help is recorded, while replayed model deliveries do not duplicate the archive',async t=>{
 const f=controller(t);await f.ask('ayuda',{messageId:'same'});await f.ask('ayuda',{messageId:'same'});f.c.helper=async()=>{throw new Error('provider down');};await f.ask('otro tema');
 f.c.store.helpStart=()=>{throw new UserError('Límite diario alcanzado');};await assert.rejects(f.ask('una duda más'),/Límite/);
 await f.c.archive.flush();assert.deepEqual(rows(f.c.archive).map(r=>r.resultado),['answered','failed','limited']);assert.equal(f.calls(),1);
});
test('responses do not await the archive and recording exceptions cannot break them',async t=>{
 const f=controller(t);let release;f.c.archive.tail=new Promise(r=>release=r);
 const answer=await Promise.race([f.ask('¿Cómo corrijo?'),new Promise(r=>setTimeout(()=>r(null),1000))]);release();assert.ok(answer);assert.match(answer[0].text,/botones/);await f.c.archive.flush();
 f.c.archive.record=()=>{throw new Error('disk failure');};assert.match((await f.ask('otra duda'))[0].text,/botones/);
});

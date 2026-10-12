import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Registration} from './registration.mjs';
import {authorized,Controller} from './controller.mjs';
import plugin from './plugin.mjs';

function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liq-register-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const policy={dmPolicy:'pairing',allowFrom:['101']};
  const cfg={channels:{telegram:{...policy,accounts:{liki:{...policy}}}}};
  const access={admin_ids:['101'],known_ids:['101','102']};
  const project=()=>fs.writeFileSync(path.join(dir,'registration-policy.json'),JSON.stringify(access));project();
  const sent=[],warnings=[];
  const opts={dataDir:dir,config:()=>cfg,send:async(to,text,account)=>sent.push({to,text,account}),logger:{warn:x=>warnings.push(x)}};
  const reg=new Registration(opts);
  const event={channel:'telegram',accountId:'liki',senderId:'103',code:'SECRET_CODE',metadata:{firstName:'Ana',lastName:'Prueba',username:'ana'}};
  const request=id=>JSON.parse(fs.readFileSync(path.join(dir,'runtime','access-requests',id+'.json')));
  return {dir,cfg,access,project,sent,warnings,opts,reg,event,request};
}
test('request persists before notice; no profile, code or invoice stored; durable deduplication',async t=>{
  const f=setup(t);await Promise.all([f.reg.requested(f.event),f.reg.requested(f.event)]);
  await new Registration(f.opts).requested(f.event);
  const r=f.request('103');assert.equal(r.nombre,'Ana Prueba');assert.equal(r.aviso,'enviado');
  assert.deepEqual(r.notificado_a,['101']);assert.equal(f.sent.length,2);
  assert.equal(f.sent[0].to,'101');assert.equal(f.sent[1].to,'103');
  assert.equal(JSON.stringify(r).includes('SECRET_CODE'),false);
  assert.equal(fs.existsSync(path.join(f.dir,'users')),false);
  assert.equal(fs.statSync(path.join(f.dir,'runtime/access-requests/103.json')).mode&0o777,0o600);
  assert.equal(authorized(f.cfg,'liki','103',false),false);
});
test('wrong channel/account, known blocked user, invalid ID and open policy do nothing',async t=>{
  const f=setup(t);
  for(const override of [{channel:'other'},{accountId:'other'},{senderId:'102'},{senderId:'../101'},{senderId:'9223372036854775808'}])await f.reg.requested({...f.event,...override});
  f.cfg.channels.telegram.dmPolicy='open';await f.reg.requested(f.event);
  assert.equal(f.sent.length,0);assert.equal(fs.existsSync(path.join(f.dir,'runtime')),false);
});
test('untrusted metadata cannot choose recipient and revoked admin gets no notice',async t=>{
  const f=setup(t);f.cfg.channels.telegram.accounts.liki.allowFrom=[];
  await f.reg.requested({...f.event,metadata:{firstName:'A\nB\u001b',adminId:'666'}});
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].to,'103');
  assert.equal(f.request('103').aviso,'fallido');assert.equal(f.request('103').nombre,'A B');
});
test('failed delivery preserves request and does not throw into agent pipeline',async t=>{
  const f=setup(t);const reg=new Registration({...f.opts,send:async()=>{throw new Error('transport offline');}});
  await reg.requested(f.event);assert.equal(f.request('103').aviso,'fallido');
});
test('daily notification limit persists and keeps overflow requests for admin review',async t=>{
  const f=setup(t);
  for(let n=200;n<223;n++)await f.reg.requested({...f.event,senderId:String(n)});
  assert.equal(f.sent.length,40);assert.equal(f.request('222').aviso,'limite_diario');
  await new Registration(f.opts).requested({...f.event,senderId:'224'});assert.equal(f.sent.length,40);
});
test('missing projection fails closed; pairing store approval alone gives no application access',async t=>{
  const f=setup(t);fs.unlinkSync(path.join(f.dir,'registration-policy.json'));
  await f.reg.requested(f.event);assert.equal(f.sent.length,0);assert.equal(f.warnings.length,1);
  const c=new Controller({config:()=>f.cfg,options:{dataDir:f.dir},extractor:async()=>{throw new Error('must never call');},helper:async()=>{throw new Error('must never call');}});
  assert.deepEqual(await c.incoming({account:'liki',sender:'103',isGroup:false,text:'hola',media:[]}),[]);
  assert.equal(c.storeValue,null);await c.close();
  assert.equal(authorized(f.cfg,'liki','101',false),true);
  f.cfg.channels.telegram.accounts.liki.allowFrom=[];assert.equal(authorized(f.cfg,'liki','101',false),false);
});
test('registered plugin forwards fixed notices through the Telegram adapter without inference',async t=>{
  const f=setup(t),hooks={};let service;
  plugin.register({pluginConfig:{dataDir:f.dir},logger:f.opts.logger,
    runtime:{config:{current:()=>f.cfg},channel:{outbound:{loadAdapter:async channel=>{
      assert.equal(channel,'telegram');return {sendText:async({cfg,to,text,accountId})=>{assert.equal(cfg,f.cfg);f.sent.push({to,text,accountId});}};
    }}}},on:(name,handler)=>{hooks[name]=handler;},registerInteractiveHandler(){},registerService:s=>{service=s;}});
  await hooks.channel_pairing_requested(f.event);assert.equal(f.sent.length,2);assert.equal(f.sent[0].accountId,'liki');
  assert.equal(hooks.before_agent_run({}, {agentId:'liki',runId:'normal'}).outcome,'block');
  await service.stop();
});

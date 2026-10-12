import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {authorized} from './controller.mjs';

const validId=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
const clean=value=>typeof value==='string'?value.replace(/[\p{C}\r\n]/gu,' ').slice(0,160).trim():'';
const read=file=>{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)throw new Error('Invalid registration file');
  return JSON.parse(fs.readFileSync(file,'utf8'));
};
function write(file,data){
  const tmp=file+'.'+randomUUID()+'.tmp';
  const fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
  try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,file);
}

// This hook receives only transport pairing events, never message bodies or media.
export class Registration {
  constructor({dataDir,accountId='liki',config,send,logger,now=()=>new Date()}){
    Object.assign(this,{dataDir,accountId,config,send,logger,now});
    this.queue=Promise.resolve();
  }
  requested(event){
    this.queue=this.queue.then(()=>this.receive(event)).catch(()=>this.logger.warn('Liquidator: solicitud pendiente de revisión; consultar usuarios.sh solicitudes.'));
    return this.queue;
  }
  async receive(event){
    if(event.channel!=='telegram'||event.accountId!==this.accountId||!validId(event.senderId))return;
    const cfg=this.config(),tg=cfg.channels?.telegram,account=tg?.accounts?.[this.accountId];
    if(tg?.dmPolicy!=='pairing'||account?.dmPolicy!=='pairing'||tg.enabled===false||account.enabled===false)return;
    const policy=read(path.join(this.dataDir,'registration-policy.json'));
    if(!Array.isArray(policy.known_ids)||!Array.isArray(policy.admin_ids)||![...policy.known_ids,...policy.admin_ids].every(validId))throw new Error('Invalid policy');
    if(policy.known_ids.includes(event.senderId))return;
    const folder=path.join(this.dataDir,'runtime','access-requests');
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    if(fs.lstatSync(folder).isSymbolicLink())throw new Error('Invalid directory');
    const file=path.join(folder,event.senderId+'.json');
    if(fs.existsSync(file))return; // Durable deduplication, including gateway restarts.
    if(fs.readdirSync(folder).filter(n=>n.endsWith('.json')).length>=1000)throw new Error('Request capacity reached');
    const record={telegram_id:event.senderId,nombre:clean([event.metadata?.firstName,event.metadata?.lastName].filter(Boolean).join(' '))||'Sin nombre',
      username:clean(event.metadata?.username),solicitado_en:this.now().toISOString(),notificado_a:[],aviso:'pendiente'};
    write(file,record);
    const budgetFile=path.join(folder,'.notification-budget');
    const day=this.now().toISOString().slice(0,10);
    let budget=fs.existsSync(budgetFile)?read(budgetFile):{day,count:0};
    if(budget.day!==day)budget={day,count:0};
    if(!Number.isInteger(budget.count)||budget.count<0)throw new Error('Invalid budget');
    if(budget.count>=20){record.aviso='limite_diario';write(file,record);return;}
    budget.count++;write(budgetFile,budget);
    // Recipient IDs are projected from root-owned profiles, never from event metadata.
    for(const id of policy.admin_ids){
      if(!authorized(this.config(),this.accountId,id,false))continue;
      try{
        await this.send(id,`Solicitud de acceso a Liki\nNombre de Telegram: ${record.nombre}\nID de Telegram: ${record.telegram_id}\nAlias: ${record.username?'@'+record.username:'sin alias'}\nPendiente de tu revisión. Usa usuarios.sh importar ${record.telegram_id}, completa el perfil y después activar + aplicar.`,this.accountId);
        record.notificado_a.push(id);
      }catch{/* Keep the durable request available to the administrator. */}
    }
    record.aviso=record.notificado_a.length?'enviado':'fallido';write(file,record);
    try{await this.send(event.senderId,'Tu solicitud de acceso a Liki ha quedado guardada para que el administrador la revise. No tienes que enviar ningún código. Podrás usar Liki cuando active tu cuenta.',this.accountId);}catch{}
  }
  close(){return this.queue;}
}

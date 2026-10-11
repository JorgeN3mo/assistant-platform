import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {catalog} from './catalog.mjs';

// Passive, bounded archive. Nothing here is read by the model or the invoice flow.
export class ConversationArchive {
  constructor(dataDir,{logger={warn(){}},clock=()=>new Date()}={}) {
    this.directory=path.join(dataDir,'runtime','conversations');
    this.logger=logger;this.clock=clock;this.tail=Promise.resolve();this.pending=0;this.lastWarning=null;
  }
  warn(){
    const time=this.clock().getTime();if(this.lastWarning!==null&&time-this.lastWarning<60000)return;
    this.lastWarning=time;try{this.logger.warn('Liquidator: no se pudo conservar parte del registro de conversaciones; el bot sigue operativo.');}catch{}
  }
  enqueue(task){
    if(this.pending>=100){this.warn();return;}
    this.pending++;
    this.tail=this.tail.then(task).catch(()=>this.warn()).finally(()=>{this.pending--;});
  }
  async prepare(){
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});
    const stat=await fs.lstat(this.directory);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe archive directory');
    await fs.chmod(this.directory,0o700);
  }
  record({sender,messageId,question,response,status,model,provider}){
    if(!catalog.registro_conversaciones.habilitado)return;
    try{
      if(!/^[1-9]\d{0,18}$/.test(sender)||typeof question!=='string'||typeof response!=='string')return;
      const at=this.clock().toISOString();
      const record={version:1,fecha:at,usuario:sender,
        id:createHash('sha256').update(JSON.stringify([sender,messageId??null,question])).digest('hex'),
        pregunta:question.slice(0,600),respuesta:response.slice(0,2200),
        recortado:question.length>600||response.length>2200,
        resultado:String(status??'unknown').slice(0,40),entrega:'no_verificada',
        ...(typeof model==='string'?{modelo:model.slice(0,100)}:{}),
        ...(typeof provider==='string'?{proveedor:provider.slice(0,100)}:{})};
      const line=Buffer.from(JSON.stringify(record)+'\n','utf8');
      this.enqueue(async()=>{
        await this.prepare();
        const filename=path.join(this.directory,at.slice(0,10)+'.jsonl');
        const file=await fs.open(filename,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
        try{
          const stat=await file.stat();if(!stat.isFile()||stat.nlink!==1)throw new Error('Unsafe archive file');
          await file.chmod(0o600);
          if(stat.size+line.length>catalog.registro_conversaciones.max_bytes_dia)throw new Error('Daily archive size limit');
          await file.writeFile(line);
        }finally{await file.close();}
      });
    }catch{this.warn();}
  }
  cleanup(){
    // Also purge if writing is disabled, so the retention promise still holds.
    this.enqueue(async()=>{
      await this.prepare();
      const cutoff=new Date(this.clock());cutoff.setUTCHours(0,0,0,0);
      cutoff.setUTCDate(cutoff.getUTCDate()-(catalog.registro_conversaciones.retencion_dias-1));
      const day=cutoff.toISOString().slice(0,10);
      for(const entry of await fs.readdir(this.directory,{withFileTypes:true})){
        if(!entry.isFile()||!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))continue;
        const date=entry.name.slice(0,10),parsed=new Date(date);
        if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)continue;
        if(date<day)await fs.unlink(path.join(this.directory,entry.name));
      }
    });
  }
  flush(){return this.tail;}
}

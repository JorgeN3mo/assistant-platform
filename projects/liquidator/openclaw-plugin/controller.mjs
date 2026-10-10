import {Store, UserError, readAttachment, userId, EDIT_FIELDS, money} from './store.mjs';
import {extract} from './extract.mjs';
import {assist} from './help.mjs';
import {catalog, enabled, command, company, companyCode, shortNumber, methodLabel, menu} from './catalog.mjs';

export function authorized(cfg, account, sender, isGroup, expectedAccount='liki') {
  try {userId(sender);} catch {return false;}
  if(account!==expectedAccount||isGroup!==false)return false;
  const tg=cfg.channels?.telegram,a=tg?.accounts?.[account];
  return !!(tg&&a&&tg.enabled!==false&&a.enabled!==false&&tg.dmPolicy==='allowlist'&&a.dmPolicy==='allowlist'&&tg.allowFrom?.map(String).includes(sender)&&a.allowFrom?.map(String).includes(sender));
}
const euros=cents=>(cents/100).toFixed(2).replace('.',',')+' €';
const invoiceButton=(r,text,action)=>({text,callback_data:`liq:i:${r.id}:${r.revision}:${action}`});
const batchButton=(b,text,action)=>({text,callback_data:`liq:b:${b.id}:${b.revision}:${action}`});
const message=(text,buttons=[])=>({text,buttons});
const incomingPayload=r=>({...r,...(r.buttons?{channelData:{telegram:{buttons:r.buttons}}}:{})});
const stateLabel=r=>r.batch?.state==='cerrada'?'Liquidación cerrada':({guardada:'Por completar',revision:'Por revisar',pendiente_liquidar:'Aceptada',extrayendo:'Leyendo',descartada:'Descartada',eliminando:'Eliminando'}[r.state]??r.state);
export function ficha(r){
  const d=r.data,code=companyCode(d.empresa);
  return [`${code??'?'} · Factura ${shortNumber(d.numero)||'por leer'} · ${stateLabel(r)}`,
    `Empresa: ${d.empresa||'POR REVISAR'}`,`Número completo: ${d.numero||'POR REVISAR'}`,`Fecha: ${d.fecha_factura||'POR REVISAR'}`,
    `Código cliente: ${d.codigo_cliente||'POR REVISAR'}`,`Cliente: ${d.cliente||'POR REVISAR'}`,`Establecimiento: ${d.establecimiento||'—'}`,
    `Importe: ${d.importe?euros(money(d.importe)):'POR REVISAR'}`,`Método: ${methodLabel(r.payment)}`,
    ...(r.payment==='pagare'?[`Banco: ${d.banco||'OBLIGATORIO'}`,`Vencimiento: ${d.vencimiento||'OBLIGATORIO'}`]:[]),
    ...(r.payment==='transferencia'?[`Fecha transferencia: ${d.fecha_transferencia||'OBLIGATORIA'}`]:[]),
    ...(r.batch?[`Liquidación ${r.batch.id} · ${r.batch.state}`]:[]),...r.warnings.map(w=>'Revisar: '+w),
    ...(r.state==='pendiente_liquidar'?[]:['Compara los datos con la factura antes de aceptar.'])].join('\n');
}
export function buttons(r){
  if(r.batch?.state==='cerrada')return [[batchButton(r.batch,'Ver liquidación','view')]];
  if(!['guardada','revision','pendiente_liquidar'].includes(r.state))return [];
  const b=(text,action)=>invoiceButton(r,text,action);
  const rows=[...(r.state==='pendiente_liquidar'?[]:[[b('Aceptar','confirm')]]),[b('Corregir','edit'),b('Eliminar','delete')],
    [b('Efectivo','efectivo'),b('Tarjeta','tarjeta')],[b('Transferencia','transferencia'),b('Pagaré','pagare')]];
  if(r.mime!=='application/pdf'&&r.state!=='pendiente_liquidar'&&(r.warnings.length||['empresa','numero','importe'].some(k=>!r.data[k])))rows.push([b('Volver a leer la foto','retry')]);
  if(r.batch)rows.push([batchButton(r.batch,'Ver lista','view')]);
  return rows;
}
const sheet=r=>message(ficha(r),buttons(r));
function requireFunction(id){if(!enabled(id))throw new UserError('Función desactivada.');}
export class Controller {
  constructor({config,runtime,options={},extractor=extract,helper=assist,logger={warn(){}}}){
    this.config=config;this.runtime=runtime;this.extractor=extractor;this.helper=helper;this.logger=logger;
    this.options={dataDir:'/data/liquidator',mediaRoot:'/data/openclaw/state/media',accountId:'liki',maxBytes:10485760,dailyLimit:30,extractionEnabled:true,...options};
    this.activeReads=0;this.activeHelp=0;this.storeValue=null;
  }
  get store(){if(!this.storeValue){this.storeValue=new Store(this.options.dataDir);this.storeValue.recoverInterrupted();}return this.storeValue;}
  close(){this.storeValue?.close();}
  permitted(account,sender,isGroup){return authorized(this.config(),account,sender,isGroup,this.options.accountId);}
  async reading(sender,id,account){
    if(!enabled('extraer_factura')||!this.options.extractionEnabled)throw new UserError('Lectura automática desactivada. El archivo está guardado.');
    if(!this.permitted(account,sender,false))throw new UserError('Acceso no autorizado.');
    if(this.activeReads>=2)throw new UserError('Hay lecturas en curso. Tu archivo está guardado; vuelve a leerlo más tarde.');
    const r=this.store.startExtraction(sender,id,this.options.dailyLimit);this.activeReads++;
    try{return this.store.finishExtraction(sender,id,r.revision,await this.extractor(this.runtime,this.config(),r));}
    catch{this.logger.warn('Liquidator: extracción fallida; original conservado.');return this.store.finishExtraction(sender,id,r.revision,null,true);}
    finally{this.activeReads--;}
  }
  async help(sender,text,messageId){
    if(!enabled('ayuda_llm'))return message(menu());
    if(text.length>catalog.limites.pregunta_caracteres)return message('Resume tu duda en un máximo de 600 caracteres. '+menu());
    if(this.activeHelp>=2)return message('La ayuda está ocupada. Puedes usar /ayuda o los botones.');
    const attempt=this.store.helpStart(sender,messageId??`missing:${text}`);if(!attempt.fresh)return message(attempt.cached);
    this.activeHelp++;let answer;
    try{answer=await this.helper(this.runtime,this.config(),text);}catch{answer='La ayuda no está disponible ahora. '+menu();}
    finally{this.activeHelp--;}
    this.store.helpFinish(sender,attempt.key,answer);return message(answer);
  }
  editPrompt(sender,r,field){
    this.store.beginEdit(sender,r.id,r.revision,field);
    const hint=catalog.campos[field].tipo==='fecha'?' Usa AAAA-MM-DD o DD/MM/AAAA.':field==='empresa'?' Usa D, R o RD.':field==='numero'?' Incluye serie/año y número correlativo.':'';
    return message(`${companyCode(r.data.empresa)||'?'} · ${shortNumber(r.data.numero)||'Factura'}\nIntroduce ${catalog.campos[field].nombre.toLowerCase()}.${hint}\n/cancelar para salir.`,[[invoiceButton(r,'Cancelar','cancel')]]);
  }
  nextPayment(sender,r){const field=catalog.metodos[r.payment].obligatorios.find(k=>!r.data[k]);return field?this.editPrompt(sender,r,field):sheet(r);}
  batchSheet(sender,id,page=0){
    const b=this.store.batch(sender,id),all=this.store.batchRows(sender,id),start=page*6,rows=all.slice(start,start+6),sums=Object.fromEntries(Object.keys(catalog.metodos).map(k=>[k,0]));
    let total=0,missing=0;for(const r of all){if(r.data.importe){const n=money(r.data.importe);total+=n;sums[r.payment]+=n;}else missing++;}
    const lines=[`${companyCode(b.company)} · Liquidación ${b.id} · ${b.state} · v${b.version}`,`Código | Factura | Importe | Método`,...rows.flatMap(r=>[
      `${r.state==='pendiente_liquidar'?'✓':'⚠'} ${r.data.codigo_cliente||'?'} | ${shortNumber(r.data.numero)||'?'} | ${r.data.importe?euros(money(r.data.importe)):'?'} | ${methodLabel(r.payment)}`,
      ...(r.payment==='pagare'?[`  Banco: ${r.data.banco||'?'} · Vencimiento: ${r.data.vencimiento||'?'}`]:[]),
      ...(r.payment==='transferencia'?[`  Fecha transferencia: ${r.data.fecha_transferencia||'?'}`]:[])]),
      `\nTotal de la lista: ${euros(total)}${missing?' (hay importes pendientes)':''}`,...Object.entries(sums).filter(([,n])=>n).map(([k,n])=>`${methodLabel(k)}: ${euros(n)}`),
      `${all.length} facturas · ${this.store.closeProblems(sender,id).length} pendientes de aceptar/completar`];
    const btns=rows.map(r=>[invoiceButton(r,`${shortNumber(r.data.numero)||'Sin número'} · ${r.data.codigo_cliente||'Sin código'}`,'view')]);
    const nav=[];if(page>0)nav.push(batchButton(b,'Anterior',`page${page-1}`));if(start+6<all.length)nav.push(batchButton(b,'Siguiente',`page${page+1}`));if(nav.length)btns.push(nav);
    btns.push(b.state==='cerrada'?[batchButton(b,'Reabrir','reopen'),batchButton(b,'Descargar CSV','export')]:[batchButton(b,'Revisar y cerrar','close')]);
    return message(lines.join('\n'),btns);
  }
  closePreview(sender,id){
    const b=this.store.batch(sender,id),rows=this.store.batchRows(sender,id);
    if(b.state==='cerrada')throw new UserError('La liquidación ya está cerrada.');
    if(!rows.length)throw new UserError('La lista está vacía.');
    const problems=this.store.closeProblems(sender,id);if(problems.length)return message(`No se puede cerrar: ${problems.length} facturas sin aceptar o incompletas.`,problems.slice(0,8).map(r=>[invoiceButton(r,`Revisar ${shortNumber(r.data.numero)||'factura'}`,'view')]));
    const total=rows.reduce((n,r)=>n+money(r.data.importe),0);
    return message(`Cerrar ${companyCode(b.company)} · Liquidación ${b.id}\n${rows.length} facturas · ${euros(total)}\nLas nuevas fotos irán a una lista nueva de esta empresa.`,[[batchButton(b,'Confirmar cierre','closeyes'),batchButton(b,'Volver','view')]]);
  }
  reopenPreview(sender,id){const b=this.store.batch(sender,id);if(b.state!=='cerrada')throw new UserError('La liquidación ya está abierta.');return message(`¿Reabrir ${companyCode(b.company)} · Liquidación ${b.id}?\nLas nuevas fotos seguirán en la lista nueva. El CSV anterior quedará invalidado en el servidor.`,[[batchButton(b,'Confirmar reapertura','reopenyes'),batchButton(b,'Volver','view')]]);}
  async incoming({account,sender,isGroup,messageId,text='',media=[]}){
    if(!this.permitted(account,sender,isGroup))return [];
    const replies=await this.dispatch({account,sender,messageId,text,media});
    return this.permitted(account,sender,false)?replies.map(incomingPayload):[];
  }
  async dispatch({account,sender,messageId,text,media}){
    if(media.length){
      requireFunction('recibir_factura');if(!messageId)throw new UserError('No se pudo identificar el mensaje. Reenvíalo.');if(media.length>4)throw new UserError('Envía como máximo cuatro documentos, una factura por archivo.');
      this.store.cancelEdit(sender);const replies=[];
      for(let i=0;i<media.length;i++){
        try{
          const m=media[i];if(!m.path)throw new UserError('Adjunto no disponible. Reenvíalo como foto.');
          const received=this.store.receive(sender,[account,String(m.messageId??messageId),i],readAttachment(m.path,this.options.mediaRoot,this.options.maxBytes));let r=received.invoice;
          if(received.fresh&&r.mime!=='application/pdf'){try{r=await this.reading(sender,r.id,account);}catch(e){replies.push(message(e instanceof UserError?e.message:'Archivo guardado, lectura no disponible.'));}}
          if(r.mime==='application/pdf'&&r.state==='guardada')replies.push(message('PDF guardado. Completa sus datos pulsando Corregir; la lectura automática admite fotos.'));
          replies.push(sheet(r));
        }catch(e){replies.push(message(e instanceof UserError?e.message:'No se pudo completar el guardado. Reenvía el archivo.'));}
      }return replies;
    }
    const t=text.trim(),match=/^\/([a-z]+)(?:@liki_liquidator_bot)?(?:\s+(.*))?$/i.exec(t);
    if(match){
      const name=match[1].toLowerCase(),args=(match[2]??'').trim(),fn=command(name);
      if(fn){
        if(fn.id==='ayuda')return [message(menu())];
        if(name==='cancelar'){this.store.cancelEdit(sender);return [message('Edición cancelada. '+menu())];}
        if(fn.id==='consultar_listas'){const c=company(name),b=this.store.current(sender,c);return [b?this.batchSheet(sender,b.id):message(`${name.toUpperCase()} · ${c}\nLista nueva vacía. Envía una foto para empezar.`)];}
        if(name==='pendientes'){
          const rows=this.store.list(sender).filter(r=>r.state!=='pendiente_liquidar'&&r.state!=='eliminando');const page=/^\d+$/.test(args)?Number(args):0;return [message(rows.length?`Facturas pendientes (${rows.length}). Página ${page+1}.`: 'No tienes facturas pendientes.',[...rows.slice(page*8,page*8+8).map(r=>[invoiceButton(r,`${companyCode(r.data.empresa)||'?'} · ${shortNumber(r.data.numero)||'Sin número'} · ${r.data.codigo_cliente||'Sin código'}`,'view')]),...(rows.length>(page+1)*8?[[{text:'Siguiente',callback_data:`liq:p:${page+1}`}]]:[])])];
        }
        if(name==='ver'){
          const m=/^(\d{1,4})\s+(D|R|RD)$/i.exec(args);if(!m)return [message('Usa /ver 9072 D: últimos cuatro dígitos y empresa D, R o RD.')];
          const rows=this.store.findInvoice(sender,m[1],company(m[2]));
          if(!rows.length)return [message('No se encuentra esa factura. Consulta /d, /r o /rd.')];
          if(rows.length===1)return [sheet(rows[0])];return [message('Hay varias coincidencias. Selecciona la factura:',rows.slice(0,30).map(r=>[invoiceButton(r,`${r.data.numero} · L${r.batch?.id||'?'} · ${r.data.fecha_factura}`,'view')]))];
        }
        if(name==='cerrar'){const c=company(args);if(!c)return [message('Usa /cerrar D, /cerrar R o /cerrar RD.')];const b=this.store.current(sender,c);return [b?this.closePreview(sender,b.id):message('La lista está vacía.')];}
        if(name==='historial'){
          const page=/^\d+$/.test(args)?Number(args):0,rows=this.store.history(sender,page*10);return [message('Liquidaciones · Página '+(page+1),[...rows.map(b=>[batchButton(b,`${companyCode(b.company)} · ${b.id} · ${b.state}`,'view')]),...(rows.length===10?[[{text:'Siguiente',callback_data:`liq:h:${page+1}`}]]:[])])];
        }
        if(['liquidacion','reabrir','exportar'].includes(name)){
          if(!/^\d{1,12}$/.test(args))return [message(`Usa /${name} 12, con el número de liquidación de /historial.`)];
          const id=Number(args);return [name==='liquidacion'?this.batchSheet(sender,id):name==='reabrir'?this.reopenPreview(sender,id):messageWithFile(this.store.exportCSV(sender,id,this.options.mediaRoot))];
        }
      }
      return [await this.help(sender,t,messageId)];
    }
    const edit=this.store.pendingEdit(sender);
    if(edit){
      requireFunction('corregir_factura');let value=t;if(edit.field==='empresa')value=company(t)??t;
      const r=this.store.change(sender,edit.invoice_id,edit.revision,'edit',{field:edit.field,value});return [this.nextPayment(sender,r)];
    }
    if(!t||/^(hola|hello|buenas|gracias|ok)[!. ]*$/i.test(t))return [message(menu())];
    return [await this.help(sender,t,messageId)];
  }
  async callback({account,sender,isGroup,data}){
    if(!this.permitted(account,sender,isGroup))return null;
    const d=String(data??'').replace(/^liq:/,'');
    if(/^[ph]:\d{1,6}$/.test(d)){const [kind,page]=d.split(':');return (await this.dispatch({account,sender,messageId:'page:'+d,text:`/${kind==='p'?'pendientes':'historial'} ${page}`,media:[]}))[0];}
    const batch=/^b:(\d{1,12}):(\d+):(view|page\d{1,6}|close|closeyes|reopen|reopenyes|export)$/.exec(d);
    if(batch){
      const [,id,v,a]=batch,b=this.store.batch(sender,Number(id));requireFunction(a.startsWith('close')?'cerrar_liquidacion':a.startsWith('reopen')?'reabrir_liquidacion':a==='export'?'exportar_liquidacion':'historial');
      if(a==='view'||a.startsWith('page'))return this.batchSheet(sender,b.id,a==='view'?0:Number(a.slice(4)));
      if(b.revision!==Number(v))throw new UserError('La liquidación ha cambiado. Abre /liquidacion '+id);
      if(a==='close')return this.closePreview(sender,b.id);
      if(a==='reopen')return this.reopenPreview(sender,b.id);
      if(a==='closeyes'){this.store.closeBatch(sender,b.id,b.revision);return this.batchSheet(sender,b.id);}
      if(a==='reopenyes'){this.store.reopenBatch(sender,b.id,b.revision);return this.batchSheet(sender,b.id);}
      // Telegram callback replies support text/buttons only. Route this trusted
      // command through normal ingress, whose dispatcher can deliver documents.
      return {submitText:`/exportar ${b.id}`};
    }
    const m=/^(?:i:)?([a-f0-9]{24}):(\d+):(view|confirm|edit|f\d{1,2}|efectivo|tarjeta|transferencia|pagare|retry|discard|delete|deleteyes|cancel)$/.exec(d);
    if(!m)throw new UserError('Botón no válido. Abre de nuevo la lista.');
    const [,id,v,a]=m,r=this.store.get(sender,id),revision=Number(v);
    if(a==='view'){requireFunction('consultar_facturas');return sheet(r);}
    if(a==='cancel'){this.store.cancelEdit(sender);return sheet(r);}
    this.store.editable(r,revision);
    if(a==='edit'){
      requireFunction('corregir_factura');const fields=EDIT_FIELDS.filter(k=>catalog.campos[k].extraido||catalog.metodos[r.payment].obligatorios.includes(k));
      return message('¿Qué dato quieres corregir?',fields.map(k=>[invoiceButton(r,catalog.campos[k].nombre,'f'+EDIT_FIELDS.indexOf(k))]));
    }
    if(/^f\d+$/.test(a)){requireFunction('corregir_factura');const field=EDIT_FIELDS[Number(a.slice(1))];if(!field)throw new UserError('Campo no válido.');return this.editPrompt(sender,r,field);}
    if(['discard','delete','deleteyes'].includes(a)){
      requireFunction('eliminar_factura');if(a!=='deleteyes')return message(`¿Eliminar definitivamente la factura ${shortNumber(r.data.numero)||'sin número'}? Se borrará de la lista y del almacenamiento activo.`,[[invoiceButton(r,'Sí, eliminar','deleteyes'),invoiceButton(r,'Volver','view')]]);
      this.store.deleteInvoice(sender,id,revision);return message('Factura eliminada de la lista y del almacenamiento activo.');
    }
    if(a==='retry'){requireFunction('extraer_factura');const updated=await this.reading(sender,id,account);return this.permitted(account,sender,false)?sheet(updated):null;}
    requireFunction(a==='confirm'?'confirmar_cobro':'cambiar_cobro');
    const changed=this.store.change(sender,id,revision,a==='confirm'?'confirm':'payment',a);
    return a==='confirm'?sheet(changed):this.nextPayment(sender,changed);
  }
}
function messageWithFile(path){return {text:'CSV de la liquidación cerrada.',mediaUrl:path};}

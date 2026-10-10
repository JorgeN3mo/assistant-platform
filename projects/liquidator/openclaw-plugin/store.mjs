import {DatabaseSync} from 'node:sqlite';
import * as fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

import {catalog, companyCode, shortNumber} from './catalog.mjs';
export const COMPANIES = Object.values(catalog.empresas);
export const PAYMENTS = Object.keys(catalog.metodos);
export const EDIT_FIELDS = Object.keys(catalog.campos);
export const FIELDS = EDIT_FIELDS.filter(k => catalog.campos[k].extraido);
const REQUIRED = EDIT_FIELDS.filter(k => catalog.campos[k].obligatorio);
const sha = b => createHash('sha256').update(b).digest('hex');
const now = () => new Date().toISOString();
export class UserError extends Error {}
export function userId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new UserError('Identidad no válida.');
  return value;
}
function directory(p) {
  fs.mkdirSync(p, {recursive: true, mode: 0o700});
  if (fs.lstatSync(p).isSymbolicLink() || !fs.statSync(p).isDirectory()) throw new Error('Unsafe data directory');
}
function syncDir(p) { const fd = fs.openSync(p, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function writeNew(p, bytes) {
  const temporary = p + '.tmp-' + randomUUID();
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, p);
  syncDir(path.dirname(p));
}
export function money(value) {
  if (typeof value !== 'string' || !/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim())) throw new UserError('Importe no válido. Ejemplo: 125,50');
  const [whole, decimal = ''] = value.trim().replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (cents <= 0) throw new UserError('El importe debe ser positivo; abonos y cobros parciales quedan fuera de esta prueba.');
  return cents;
}
export function validateField(key, value) {
  if (!EDIT_FIELDS.includes(key) || typeof value !== 'string') throw new UserError('Campo no permitido.');
  let v = value.normalize('NFC').trim();
  if (catalog.campos[key].tipo === 'fecha' && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) v = v.split('/').reverse().join('-');
  if (v.length > 200 || /[\x00-\x1f\x7f]/.test(v)) throw new UserError('Texto no válido.');
  if (REQUIRED.includes(key) && !v) throw new UserError('Este campo es obligatorio.');
  if (key === 'empresa' && !COMPANIES.includes(v)) throw new UserError('Empresa: DIBOS, REDISSA o REDISSA & DIBOS.');
  if (key === 'numero' && /^\d+\/\d{4}$/.test(v)) throw new UserError('Falta el número correlativo después de la serie/año.');
  if (key === 'importe') return (money(v) / 100).toFixed(2);
  if (catalog.campos[key].tipo === 'fecha' && v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) throw new UserError('Fecha no válida. Usa AAAA-MM-DD.');
  return v;
}
export function cleanExtraction(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UserError('La lectura no produjo una ficha válida.');
  const data = {}, warnings = [];
  for (const key of FIELDS) {
    try { data[key] = raw[key] === null || raw[key] === undefined ? null : validateField(key, raw[key]); }
    catch { data[key] = null; warnings.push(`Revisar ${key}`); }
  }
  if (raw.principal_clara !== true) {
    for (const key of REQUIRED) data[key] = null;
    warnings.push('No se distingue con seguridad una única factura principal. Corrige los datos o envía otra foto.');
  }
  if (Array.isArray(raw.dudas)) warnings.push(...raw.dudas.filter(x => typeof x === 'string').slice(0, 5).map(x => x.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 160)));
  return {data, warnings};
}
export function readAttachment(source, mediaRoot, maxBytes) {
  const root = fs.realpathSync(mediaRoot), resolved = fs.realpathSync(source);
  if (!resolved.startsWith(root + path.sep) || fs.lstatSync(source).isSymbolicLink()) throw new UserError('El adjunto no procede del almacenamiento autorizado.');
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) throw new UserError('Archivo vacío o superior al límite de 10 MiB.');
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0, n;
    while (length < bytes.length && (n = fs.readSync(fd, bytes, length, bytes.length - length, null)) > 0) length += n;
    if (length !== stat.size) throw new UserError('Archivo incompleto o modificado durante la recepción.');
    const b = bytes.subarray(0, length);
    let ext, mime;
    if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) { ext = 'png'; mime = 'image/png'; }
    else if (b[0] === 255 && b[1] === 216 && b[2] === 255) { ext = 'jpg'; mime = 'image/jpeg'; }
    else if (b.subarray(0, 5).toString() === '%PDF-') { ext = 'pdf'; mime = 'application/pdf'; }
    else throw new UserError('Solo se admiten fotos JPG/PNG o documentos PDF.');
    return {bytes: b, ext, mime, hash: sha(b), source: resolved};
  } finally { fs.closeSync(fd); }
}
export class Store {
  constructor(root) {
    this.root = path.resolve(root);
    directory(this.root); directory(path.join(this.root, 'runtime')); directory(path.join(this.root, 'invoices'));
    const dbPath = path.join(this.root, 'runtime', 'liquidator.sqlite3');
    if (fs.existsSync(dbPath) && fs.lstatSync(dbPath).isSymbolicLink()) throw new Error('Unsafe database');
    // The parent is private; create the database with private permissions before SQLite opens it.
    if (!fs.existsSync(dbPath)) fs.closeSync(fs.openSync(dbPath, 'wx', 0o600));
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, sha256 TEXT NOT NULL, mime TEXT NOT NULL,
        original TEXT NOT NULL, registered_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'guardada',
        data TEXT NOT NULL DEFAULT '{}', warnings TEXT NOT NULL DEFAULT '[]', payment TEXT NOT NULL DEFAULT 'efectivo',
        revision INTEGER NOT NULL DEFAULT 1, confirmed_at TEXT, liquidacion_id TEXT, document_key TEXT,
        UNIQUE(owner,sha256));
      CREATE UNIQUE INDEX IF NOT EXISTS confirmed_document ON invoices(owner,document_key) WHERE document_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS deliveries (delivery_key TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id));
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), owner TEXT NOT NULL, at TEXT NOT NULL, finished INTEGER NOT NULL DEFAULT 0);
      `);
    this.migrate();
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  audit(id, action, detail = {}) { this.db.prepare('INSERT INTO audit(invoice_id,at,action,detail) VALUES (?,?,?,?)').run(id, now(), action, JSON.stringify(detail)); }
  get(owner, id) {
    userId(owner);
    if (!/^[a-f0-9]{24}$/.test(id ?? '')) throw new UserError('Referencia no válida.');
    const row = this.db.prepare('SELECT * FROM invoices WHERE id=? AND owner=?').get(id, owner);
    if (!row) throw new UserError('No se encuentra esa factura para tu usuario.');
    return {...row, data: JSON.parse(row.data), warnings: JSON.parse(row.warnings), batch: row.liquidacion_id ? this.batch(owner, row.liquidacion_id) : null};
  }
  receive(owner, delivery, attachment) {
    userId(owner);
    const key = sha(JSON.stringify([owner, ...delivery]));
    return this.transaction(() => {
      let found = this.db.prepare('SELECT invoice_id FROM deliveries WHERE delivery_key=?').get(key);
      if (found) return {invoice: this.get(owner, found.invoice_id), fresh: false};
      let same = this.db.prepare('SELECT id FROM invoices WHERE owner=? AND sha256=?').get(owner, attachment.hash);
      if (same) {
        this.db.prepare('INSERT INTO deliveries VALUES (?,?)').run(key, same.id);
        if (attachment.source) this.db.prepare('INSERT OR IGNORE INTO sources(invoice_id,path) VALUES (?,?)').run(same.id, attachment.source);
        return {invoice: this.get(owner, same.id), fresh: false};
      }
      const id = sha(`${owner}\0${attachment.hash}`).slice(0, 24), registered = now();
      const folder = path.join(this.root, 'invoices', owner, id);
      directory(path.dirname(folder)); directory(folder);
      const original = path.join(folder, `original.${attachment.ext}`), metadata = path.join(folder, 'metadata.json');
      // A crash before the DB commit leaves a recoverable original with this deterministic ID.
      if (fs.existsSync(original)) {
        if (fs.lstatSync(original).isSymbolicLink() || sha(fs.readFileSync(original)) !== attachment.hash) throw new Error('Original integrity failure');
      } else writeNew(original, attachment.bytes);
      let receivedAt = registered;
      if (fs.existsSync(metadata)) {
        if (fs.lstatSync(metadata).isSymbolicLink()) throw new Error('Unsafe receipt');
        const old = JSON.parse(fs.readFileSync(metadata, 'utf8'));
        if (old.sha256 !== attachment.hash || old.owner !== owner) throw new Error('Receipt integrity failure');
        receivedAt = old.registered_at;
      } else writeNew(metadata, JSON.stringify({id, owner, registered_at: registered, sha256: attachment.hash, mime: attachment.mime, bytes: attachment.bytes.length, delivery}, null, 2));
      syncDir(folder); syncDir(path.dirname(folder));
      this.db.prepare('INSERT INTO invoices(id,owner,sha256,mime,original,registered_at) VALUES (?,?,?,?,?,?)').run(id, owner, attachment.hash, attachment.mime, original, receivedAt);
      this.db.prepare('INSERT INTO deliveries VALUES (?,?)').run(key, id);
      if (attachment.source) this.db.prepare('INSERT OR IGNORE INTO sources(invoice_id,path) VALUES (?,?)').run(id, attachment.source);
      this.audit(id, 'recibida');
      return {invoice: this.get(owner, id), fresh: true};
    });
  }
  list(owner) { userId(owner); return this.db.prepare("SELECT id FROM invoices WHERE owner=? AND state NOT IN ('descartada','eliminando') ORDER BY registered_at DESC").all(owner).map(x => this.get(owner, x.id)); }
  startExtraction(owner, id, dailyLimit) {
    return this.transaction(() => {
      const r = this.get(owner, id);
      if (r.batch?.state === 'cerrada') throw new UserError('Reabre la liquidación antes de modificarla.');
      if (!['guardada', 'revision'].includes(r.state)) throw new UserError('La factura no está disponible para lectura.');
      this.consume(owner, 'extract', dailyLimit, 1000);
      if (r.mime === 'application/pdf') throw new UserError('PDF guardado. En esta prueba, envía una foto para lectura automática o corrige los campos manualmente.');
      this.db.prepare("UPDATE invoices SET state='extrayendo', revision=revision+1 WHERE id=?").run(id);
      this.db.prepare('INSERT INTO attempts(invoice_id,owner,at) VALUES (?,?,?)').run(id, owner, now());
      this.audit(id, 'lectura_iniciada');
      return this.get(owner, id);
    });
  }
  finishExtraction(owner, id, expectedRevision, raw, failure = false) {
    return this.transaction(() => {
      const r = this.get(owner, id);
      if (r.state !== 'extrayendo' || r.revision !== expectedRevision) throw new UserError('La ficha ha cambiado; vuelve a abrirla.');
      const clean = failure ? {data: r.data, warnings: ['No se pudo leer. El original y los datos anteriores están guardados. Puedes corregir los campos o reintentar.']} : cleanExtraction(raw);
      for (const key of ['banco','vencimiento','fecha_transferencia']) if (r.data[key]) clean.data[key] = r.data[key];
      this.db.prepare("UPDATE invoices SET state='revision', data=?, warnings=?, revision=revision+1 WHERE id=?").run(JSON.stringify(clean.data), JSON.stringify(clean.warnings), id);
      this.db.prepare('UPDATE attempts SET finished=1 WHERE invoice_id=? AND finished=0').run(id);
      this.assign(owner, id, clean.data.empresa);
      this.audit(id, failure ? 'lectura_fallida' : 'lectura_completada');
      return this.get(owner, id);
    });
  }
  recoverInterrupted() {
    this.transaction(() => {
      for (const r of this.db.prepare("SELECT id FROM invoices WHERE state='extrayendo'").all()) {
        this.db.prepare("UPDATE invoices SET state='revision', revision=revision+1, warnings=? WHERE id=?").run(JSON.stringify(['Lectura interrumpida. No se reintentó automáticamente.']), r.id);
        this.audit(r.id, 'lectura_interrumpida');
      }
    });
  }
  migrate() {
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 2) throw new Error('Database version is newer than this application');
    this.transaction(() => {
      this.db.exec(`CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, company TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'abierta', revision INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, closed_at TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS current_batch ON batches(owner,company) WHERE state='abierta';
        CREATE TABLE IF NOT EXISTS edits (owner TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, revision INTEGER NOT NULL, field TEXT NOT NULL, expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS usage_owner ON usage(owner,kind,at);
        CREATE TABLE IF NOT EXISTS help_replies (owner TEXT NOT NULL, delivery TEXT NOT NULL, response TEXT, PRIMARY KEY(owner,delivery));
        CREATE TABLE IF NOT EXISTS sources (invoice_id TEXT NOT NULL, path TEXT NOT NULL, UNIQUE(invoice_id,path));
        CREATE TABLE IF NOT EXISTS exports (batch_id INTEGER NOT NULL, path TEXT NOT NULL PRIMARY KEY);`);
      if (version < 2) {
        this.db.exec("INSERT INTO usage(owner,kind,at) SELECT owner,'extract',at FROM attempts");
        for (const r of this.db.prepare("SELECT id,owner,data FROM invoices WHERE state!='descartada'").all()) this.assign(r.owner, r.id, JSON.parse(r.data).empresa);
        this.db.exec('PRAGMA user_version=2');
      }
    });
    for (const r of this.db.prepare("SELECT owner,id FROM invoices WHERE state='eliminando'").all()) this.finishDelete(r.owner,r.id);
  }
  consume(owner, kind, daily, perMinute) {
    const date = now();
    if (this.db.prepare('SELECT count(*) n FROM usage WHERE owner=? AND kind=? AND at>=?').get(owner,kind,date.slice(0,10)).n >= daily) throw new UserError('Límite diario alcanzado. Puedes seguir usando los comandos y botones.');
    if (this.db.prepare('SELECT count(*) n FROM usage WHERE owner=? AND kind=? AND at>=?').get(owner,kind,new Date(Date.now()-60000).toISOString()).n >= perMinute) throw new UserError('Demasiadas consultas seguidas. Espera un minuto o usa /ayuda.');
    this.db.prepare('INSERT INTO usage(owner,kind,at) VALUES (?,?,?)').run(owner,kind,date);
  }
  helpStart(owner, delivery) {
    return this.transaction(() => {
      const key=sha(String(delivery));
      const prior=this.db.prepare('SELECT response FROM help_replies WHERE owner=? AND delivery=?').get(owner,key);
      if (prior) return {key, cached:prior.response ?? 'La ayuda anterior sigue en curso o se interrumpió. Usa /ayuda.', fresh:false};
      this.consume(owner,'help',catalog.limites.ayuda_diaria,catalog.limites.ayuda_minuto);
      this.db.prepare('INSERT INTO help_replies VALUES (?,?,NULL)').run(owner,key);
      return {key,fresh:true};
    });
  }
  helpFinish(owner,key,response) { this.db.prepare('UPDATE help_replies SET response=? WHERE owner=? AND delivery=?').run(response,owner,key); }
  current(owner, company, create=false) {
    userId(owner);if (!COMPANIES.includes(company)) throw new UserError('Empresa no válida.');
    let b=this.db.prepare("SELECT * FROM batches WHERE owner=? AND company=? AND state='abierta'").get(owner,company);
    if (!b && create) {const id=this.db.prepare('INSERT INTO batches(owner,company,created_at) VALUES (?,?,?)').run(owner,company,now()).lastInsertRowid;b=this.batch(owner,id);}
    return b;
  }
  batch(owner,id) {
    userId(owner);const b=this.db.prepare('SELECT * FROM batches WHERE id=? AND owner=?').get(id,owner);
    if (!b) throw new UserError('Liquidación no encontrada para tu usuario.');return b;
  }
  batchRows(owner,id) {this.batch(owner,id);return this.db.prepare("SELECT id FROM invoices WHERE owner=? AND liquidacion_id=? AND state NOT IN ('descartada','eliminando') ORDER BY registered_at,id").all(owner,String(id)).map(x=>this.get(owner,x.id));}
  history(owner, offset=0) {userId(owner);return this.db.prepare('SELECT * FROM batches WHERE owner=? ORDER BY id DESC LIMIT 10 OFFSET ?').all(owner,offset);}
  touch(id) {if(id)this.db.prepare('UPDATE batches SET revision=revision+1 WHERE id=?').run(id);}
  assign(owner,id,company) {
    if(!COMPANIES.includes(company))return;
    const r=this.db.prepare('SELECT liquidacion_id FROM invoices WHERE owner=? AND id=?').get(owner,id);
    const previous=r.liquidacion_id ? this.batch(owner,r.liquidacion_id) : null;
    if(previous?.company===company){this.touch(previous.id);return;}
    const next=this.current(owner,company,true);
    this.db.prepare('UPDATE invoices SET liquidacion_id=? WHERE owner=? AND id=?').run(String(next.id),owner,id);
    this.touch(previous?.id);this.touch(next.id);
  }
  problems(r) {
    const missing=[];
    if (!PAYMENTS.includes(r.payment)) missing.push('Forma de cobro');
    for(const key of [...REQUIRED,...(catalog.metodos[r.payment]?.obligatorios??[])]){
      try {if(!r.data[key])throw new Error();validateField(key,r.data[key]);}catch{missing.push(catalog.campos[key].nombre);}
    }
    return missing;
  }
  editable(r,revision) {
    if(r.revision!==revision)throw new UserError('La ficha ha cambiado. Ábrela de nuevo desde su lista.');
    if(r.batch?.state==='cerrada')throw new UserError('Reabre la liquidación antes de modificarla.');
    if(!['guardada','revision','pendiente_liquidar'].includes(r.state))throw new UserError('Factura no disponible para edición.');
  }
  change(owner,id,revision,action,value) {
    return this.transaction(() => {
      const r=this.get(owner,id);this.editable(r,revision);
      let {data,payment}=r,state='revision',documentKey=null,confirmed=null;
      if(action==='payment'){
        if(!PAYMENTS.includes(value))throw new UserError('Forma de cobro no válida.');payment=value;
        data={...data};for(const key of ['banco','vencimiento','fecha_transferencia'])if(!catalog.metodos[payment].obligatorios.includes(key))delete data[key];
      }else if(action==='edit')data={...data,[value.field]:validateField(value.field,value.value)};
      else if(action==='discard')throw new UserError('Usa Eliminar y confirma el borrado.');
      else if(action==='confirm'){
        const missing=this.problems(r);if(missing.length)throw new UserError('Falta o no es válido: '+missing.join(', ')+'.');
        documentKey=data.empresa+':'+data.numero.toUpperCase().replace(/[^A-Z0-9]/g,'');
        if(this.db.prepare('SELECT id FROM invoices WHERE owner=? AND document_key=? AND id<>?').get(owner,documentKey,id))throw new UserError('Esa factura ya está confirmada para tu usuario. Revisa el duplicado.');
        state='pendiente_liquidar';confirmed=now();
      }else throw new UserError('Acción no permitida.');
      this.db.prepare('UPDATE invoices SET data=?,payment=?,state=?,revision=revision+1,document_key=?,confirmed_at=?,warnings=? WHERE id=?').run(JSON.stringify(data),payment,state,documentKey,confirmed,JSON.stringify(action==='confirm'?[]:r.warnings),id);
      this.assign(owner,id,data.empresa);this.audit(id,action,{previous_revision:revision});
      this.db.prepare('DELETE FROM edits WHERE owner=? AND invoice_id=?').run(owner,id);
      return this.get(owner,id);
    });
  }
  findInvoice(owner,number,company) {
    const rows=this.db.prepare("SELECT id FROM invoices WHERE owner=? AND state NOT IN ('descartada','eliminando')").all(userId(owner)).map(r=>this.get(owner,r.id)).filter(r=>r.data.empresa===company&&shortNumber(r.data.numero)===number);
    const current=rows.filter(r=>r.batch?.state==='abierta');return current.length?current:rows;
  }
  beginEdit(owner,id,revision,field) {
    const r=this.get(owner,id);this.editable(r,revision);if(!EDIT_FIELDS.includes(field))throw new UserError('Campo no permitido.');
    if(['banco','vencimiento','fecha_transferencia'].includes(field)&&!catalog.metodos[r.payment].obligatorios.includes(field))throw new UserError('Selecciona primero la forma de cobro correspondiente.');
    this.db.prepare('INSERT OR REPLACE INTO edits VALUES (?,?,?,?,?)').run(owner,id,revision,field,new Date(Date.now()+15*60000).toISOString());return r;
  }
  pendingEdit(owner) {const r=this.db.prepare('SELECT * FROM edits WHERE owner=?').get(owner);if(r&&r.expires_at>now())return r;this.cancelEdit(owner);return null;}
  cancelEdit(owner){this.db.prepare('DELETE FROM edits WHERE owner=?').run(owner);}
  closeProblems(owner,id){return this.batchRows(owner,id).filter(r=>r.state!=='pendiente_liquidar'||this.problems(r).length);}
  closeBatch(owner,id,revision){return this.transaction(()=>{
    const b=this.batch(owner,id);if(b.revision!==revision)throw new UserError('La lista ha cambiado. Revisa el resumen actualizado.');
    if(b.state==='cerrada')throw new UserError('La liquidación ya está cerrada.');
    const rows=this.batchRows(owner,id);if(!rows.length)throw new UserError('No se puede cerrar una lista vacía.');
    if(this.closeProblems(owner,id).length)throw new UserError('Hay facturas sin aceptar o con datos de cobro incompletos. Revísalas antes de cerrar.');
    this.db.prepare("UPDATE batches SET state='cerrada',version=version+1,revision=revision+1,closed_at=? WHERE id=?").run(now(),id);
    return this.batch(owner,id);
  });}
  invalidateExports(id){for(const e of this.db.prepare('SELECT path FROM exports WHERE batch_id=?').all(id))fs.rmSync(e.path,{force:true});this.db.prepare('DELETE FROM exports WHERE batch_id=?').run(id);}
  reopenBatch(owner,id,revision){return this.transaction(()=>{
    const b=this.batch(owner,id);if(b.revision!==revision||b.state!=='cerrada')throw new UserError('La liquidación ha cambiado o ya está abierta.');
    this.invalidateExports(id);
    this.db.prepare("UPDATE batches SET state='reabierta',revision=revision+1 WHERE id=?").run(id);return this.batch(owner,id);
  });}
  deleteInvoice(owner,id,revision){
    this.transaction(()=>{const r=this.get(owner,id);this.editable(r,revision);this.touch(r.liquidacion_id);this.db.prepare("UPDATE invoices SET state='eliminando',revision=revision+1 WHERE id=?").run(id);});
    this.finishDelete(owner,id);
  }
  finishDelete(owner,id){
    const r=this.get(owner,id);if(r.state!=='eliminando')throw new Error('Deletion not admitted');
    if(r.liquidacion_id)this.invalidateExports(r.liquidacion_id);
    const folder=path.join(this.root,'invoices',userId(owner),id);
    fs.rmSync(folder,{recursive:true,force:true});
    for(const s of this.db.prepare('SELECT path FROM sources WHERE invoice_id=?').all(id)){
      if(!this.db.prepare('SELECT 1 FROM sources WHERE path=? AND invoice_id<>?').get(s.path,id))fs.rmSync(s.path,{force:true});
    }
    this.transaction(()=>{for(const table of ['deliveries','audit','attempts','sources','edits'])this.db.prepare(`DELETE FROM ${table} WHERE invoice_id=?`).run(id);this.db.prepare('DELETE FROM invoices WHERE id=? AND owner=?').run(id,owner);});
  }
  exportCSV(owner,id,mediaRoot){
    const b=this.batch(owner,id);if(b.state!=='cerrada')throw new UserError('Cierra la liquidación antes de descargarla.');
    const rows=this.batchRows(owner,id),cell=v=>'"'+String(v??'').replace(/^(\s*[=+@-])/u,"'$1").replaceAll('"','""')+'"';
    const header=['Código cliente','Factura','Importe EUR','Método','Banco','Vencimiento / fecha transferencia','Factura completa','Cliente'];
    const lines=rows.map(r=>[r.data.codigo_cliente,shortNumber(r.data.numero),r.data.importe.replace('.',','),catalog.metodos[r.payment].nombre,r.data.banco??'',r.data.vencimiento??r.data.fecha_transferencia??'',r.data.numero,r.data.cliente]);
    lines.push(['TOTAL','',(rows.reduce((n,r)=>n+money(r.data.importe),0)/100).toFixed(2).replace('.',','),'','','','','']);
    const folder=path.join(mediaRoot,'liquidator-exports',userId(owner));directory(folder);
    const output=path.join(folder,`${companyCode(b.company)}-${b.id}-v${b.version}.csv`);
    if(!fs.existsSync(output))writeNew(output,'\uFEFF'+[header,...lines].map(line=>line.map(cell).join(';')).join('\r\n')+'\r\n');
    this.db.prepare('INSERT OR IGNORE INTO exports VALUES (?,?)').run(id,output);return output;
  }
}

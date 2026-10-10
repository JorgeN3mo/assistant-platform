import {DatabaseSync} from 'node:sqlite';
import * as fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const COMPANIES = ['DIBOS', 'REDISSA', 'REDISSA & DIBOS'];
export const PAYMENTS = ['efectivo', 'tarjeta', 'transferencia'];
export const FIELDS = ['empresa', 'numero', 'fecha_factura', 'codigo_cliente', 'cliente', 'establecimiento', 'importe'];
const REQUIRED = ['empresa', 'numero', 'fecha_factura', 'cliente', 'importe'];
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
  if (!FIELDS.includes(key) || typeof value !== 'string') throw new UserError('Campo no permitido.');
  const v = value.normalize('NFC').trim();
  if (v.length > 200 || /[\x00-\x1f\x7f]/.test(v)) throw new UserError('Texto no válido.');
  if (REQUIRED.includes(key) && !v) throw new UserError('Este campo es obligatorio.');
  if (key === 'empresa' && !COMPANIES.includes(v)) throw new UserError('Empresa: DIBOS, REDISSA o REDISSA & DIBOS.');
  if (key === 'numero' && /^\d+\/\d{4}$/.test(v)) throw new UserError('Falta el número correlativo después de la serie/año.');
  if (key === 'importe') return (money(v) / 100).toFixed(2);
  if (key === 'fecha_factura' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) throw new UserError('Fecha no válida. Usa AAAA-MM-DD.');
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
    return {bytes: b, ext, mime, hash: sha(b)};
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
      PRAGMA user_version=1;`);
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
    return {...row, data: JSON.parse(row.data), warnings: JSON.parse(row.warnings)};
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
      this.audit(id, 'recibida');
      return {invoice: this.get(owner, id), fresh: true};
    });
  }
  list(owner) { userId(owner); return this.db.prepare("SELECT id FROM invoices WHERE owner=? AND state NOT IN ('descartada') ORDER BY registered_at DESC LIMIT 10").all(owner).map(x => this.get(owner, x.id)); }
  startExtraction(owner, id, dailyLimit) {
    return this.transaction(() => {
      const r = this.get(owner, id);
      if (!['guardada', 'revision'].includes(r.state)) throw new UserError('La factura no está disponible para lectura.');
      if (this.db.prepare('SELECT count(*) AS n FROM attempts WHERE owner=? AND at>=?').get(owner, now().slice(0, 10)).n >= dailyLimit) throw new UserError('Límite diario de lecturas alcanzado. El archivo sigue guardado.');
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
      this.db.prepare("UPDATE invoices SET state='revision', data=?, warnings=?, revision=revision+1 WHERE id=?").run(JSON.stringify(clean.data), JSON.stringify(clean.warnings), id);
      this.db.prepare('UPDATE attempts SET finished=1 WHERE invoice_id=? AND finished=0').run(id);
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
  change(owner, id, revision, action, value) {
    return this.transaction(() => {
      const r = this.get(owner, id);
      if (r.revision !== revision) throw new UserError('Estos botones pertenecen a una versión anterior. Abre la ficha con /ver ' + id);
      if (!['guardada', 'revision'].includes(r.state)) throw new UserError('La factura ya está confirmada, descartada o en lectura.');
      let {data, payment, state} = r, documentKey = null, confirmed = null;
      if (action === 'payment') {
        if (!PAYMENTS.includes(value)) throw new UserError('Forma de cobro no válida.');
        payment = value;
      } else if (action === 'edit') {
        data = {...data, [value.field]: validateField(value.field, value.value)};
      } else if (action === 'discard') state = 'descartada';
      else if (action === 'confirm') {
        for (const key of REQUIRED) { if (data[key] == null) throw new UserError(`Falta ${key}. Corrige la ficha antes de confirmar.`); validateField(key, data[key]); }
        documentKey = data.empresa + ':' + data.numero.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (this.db.prepare('SELECT id FROM invoices WHERE owner=? AND document_key=? AND id<>?').get(owner, documentKey, id)) throw new UserError('Esa factura ya está confirmada para tu usuario. Revisa el posible duplicado.');
        state = 'pendiente_liquidar'; confirmed = now();
      } else throw new UserError('Acción no permitida.');
      this.db.prepare('UPDATE invoices SET data=?,payment=?,state=?,revision=revision+1,document_key=?,confirmed_at=? WHERE id=?').run(JSON.stringify(data), payment, state, documentKey, confirmed, id);
      this.audit(id, action, {value: value ?? null, previous_revision: revision});
      return this.get(owner, id);
    });
  }
}

import fs from 'node:fs';
import {Store, UserError, readAttachment, userId, FIELDS} from './store.mjs';
import {extract} from './extract.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('./funciones.json', import.meta.url), 'utf8'));
const enabled = id => catalog.funciones.some(f => f.id === id && f.habilitada === true);
const HELP = 'Envía una foto de una factura cobrada (JPG/PNG, máximo 10 MiB). Guardaré el archivo y te pediré revisar los datos. Efectivo por defecto; puedes cambiarlo. /pendientes muestra tus últimas fichas. /ver REFERENCIA abre una ficha. No hay conversación libre. Las liquidaciones aún no se generan.';
export function authorized(cfg, account, sender, isGroup, expectedAccount = 'liki') {
  try { userId(sender); } catch { return false; }
  if (account !== expectedAccount || isGroup !== false) return false;
  const tg = cfg.channels?.telegram, a = tg?.accounts?.[account];
  return !!(tg && a && tg.enabled !== false && a.enabled !== false && tg.dmPolicy === 'allowlist' && a.dmPolicy === 'allowlist' &&
    tg.allowFrom?.map(String).includes(sender) && a.allowFrom?.map(String).includes(sender));
}
export function ficha(r) {
  const d = r.data;
  const text = [
    `Referencia: ${r.id}`, `Estado: ${r.state}`,
    `Empresa: ${d.empresa || 'POR REVISAR'}`, `Factura: ${d.numero || 'POR REVISAR'}`,
    `Fecha: ${d.fecha_factura || 'POR REVISAR'}`, `Cliente: ${d.cliente || 'POR REVISAR'}`,
    `Código cliente: ${d.codigo_cliente || '—'}`, `Establecimiento: ${d.establecimiento || '—'}`,
    `Total: ${d.importe ? d.importe.replace('.', ',') + ' €' : 'POR REVISAR'}`,
    `Cobro: ${r.payment}`, ...r.warnings.map(x => `Revisar: ${x}`)
  ];
  if (r.state === 'pendiente_liquidar') text.push('Cobro confirmado. Pendiente de incluir en una liquidación.');
  else if (r.state !== 'descartada') text.push('Confirma únicamente si los datos y el cobro completo son correctos.');
  return text.join('\n');
}
export function buttons(r) {
  if (!['guardada', 'revision'].includes(r.state)) return [];
  const b = (text, action) => ({text, callback_data: `liq:${r.id}:${r.revision}:${action}`});
  return [[b('Confirmar', 'confirm'), b('Corregir datos', 'edit')],
    [b('Efectivo', 'efectivo'), b('Tarjeta', 'tarjeta'), b('Transferencia', 'transferencia')],
    [b('Reintentar lectura', 'retry'), b('Descartar', 'discard')]];
}
const payload = r => ({text: ficha(r), channelData: {telegram: {buttons: buttons(r)}}});
export class Controller {
  constructor({config, runtime, options = {}, extractor = extract, logger = {warn() {}}}) {
    this.config = config; this.runtime = runtime; this.extractor = extractor; this.logger = logger;
    this.options = {dataDir: '/data/liquidator', mediaRoot: '/data/openclaw/state/media', accountId: 'liki', maxBytes: 10485760, dailyLimit: 30, extractionEnabled: true, ...options};
    this.activeReads = 0; this.storeValue = null;
  }
  get store() {
    if (!this.storeValue) { this.storeValue = new Store(this.options.dataDir); this.storeValue.recoverInterrupted(); }
    return this.storeValue;
  }
  close() { this.storeValue?.close(); }
  permitted(account, sender, isGroup) { return authorized(this.config(), account, sender, isGroup, this.options.accountId); }
  async reading(sender, id, account) {
    if (!enabled('extraer_factura') || !this.options.extractionEnabled) throw new UserError('Lectura automática desactivada. El archivo está guardado.');
    if (!this.permitted(account, sender, false)) throw new UserError('Acceso no autorizado.');
    if (this.activeReads >= 2) throw new UserError('Hay lecturas en curso. Tu archivo está guardado; reintenta la lectura más tarde.');
    const r = this.store.startExtraction(sender, id, this.options.dailyLimit);
    this.activeReads++;
    try {
      const raw = await this.extractor(this.runtime, this.config(), r);
      return this.store.finishExtraction(sender, id, r.revision, raw);
    } catch {
      this.logger.warn('Liquidator: extracción fallida; original conservado.');
      return this.store.finishExtraction(sender, id, r.revision, null, true);
    } finally { this.activeReads--; }
  }
  async incoming({account, sender, isGroup, messageId, text = '', media = []}) {
    if (!this.permitted(account, sender, isGroup)) return [];
    if (media.length) {
      if (!enabled('recibir_factura')) return [{text: 'La recepción de facturas está desactivada.'}];
      if (!messageId) throw new UserError('No se pudo identificar el mensaje. Vuelve a enviar el archivo.');
      if (media.length > 4) throw new UserError('Envía como máximo cuatro documentos por mensaje, una factura por archivo.');
      const replies = [];
      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        let r;
        try {
          if (!m.path) throw new UserError('El archivo aún no está disponible. Reenvíalo como foto o documento.');
          const attachment = readAttachment(m.path, this.options.mediaRoot, this.options.maxBytes);
          const received = this.store.receive(sender, [account, String(m.messageId ?? messageId), i], attachment);
          r = received.invoice;
          if (received.fresh && r.mime !== 'application/pdf') {
            try { r = await this.reading(sender, r.id, account); }
            catch (error) { replies.push({text: error instanceof UserError ? error.message : 'No se pudo iniciar la lectura. El archivo sigue guardado.'}); }
          }
          if (r.mime === 'application/pdf' && r.state === 'guardada') replies.push({text: 'PDF guardado. La lectura automática de esta prueba admite fotos; puedes completar sus datos mediante Corregir.'});
          replies.push(payload(r));
        } catch (error) {
          replies.push({text: error instanceof UserError ? error.message : 'No se pudo completar el guardado. Reenvía el archivo; no se ha confirmado ningún cobro.'});
        }
      }
      // Access might have been revoked while extraction was in flight.
      return this.permitted(account, sender, false) ? replies : [];
    }
    const t = text.trim();
    if (/^\/(?:start|ayuda)$/.test(t) && enabled('ayuda')) return [{text: HELP}];
    if (t === '/pendientes' && enabled('consultar_facturas')) {
      const rows = this.store.list(sender);
      return [{text: rows.length ? rows.map(r => `${r.id} · ${r.state} · ${r.data.importe || '?'} €\n/ver ${r.id}`).join('\n\n') : 'No tienes facturas registradas.'}];
    }
    const view = /^\/ver ([a-f0-9]{24})$/.exec(t);
    if (view && enabled('consultar_facturas')) return [payload(this.store.get(sender, view[1]))];
    const edit = /^\/corregir ([a-f0-9]{24}) (\d+) ([a-z_]+) (.+)$/.exec(t);
    if (edit && enabled('corregir_factura')) return [payload(this.store.change(sender, edit[1], Number(edit[2]), 'edit', {field: edit[3], value: edit[4]}))];
    return [{text: HELP}];
  }
  async callback({account, sender, isGroup, data}) {
    if (!this.permitted(account, sender, isGroup)) return null;
    const match = /^(?:liq:)?([a-f0-9]{24}):(\d+):(confirm|edit|efectivo|tarjeta|transferencia|retry|discard)$/.exec(data ?? '');
    if (!match) throw new UserError('Botón no válido.');
    const [,id,v,action] = match, revision = Number(v), r = this.store.get(sender, id);
    if (r.revision !== revision) throw new UserError('Ficha actualizada. Abre /ver ' + id);
    if (action === 'edit' && enabled('corregir_factura')) return {text: `Para corregir un campo envía:\n/corregir ${id} ${revision} importe 125,50\n\nCampos: ${FIELDS.join(', ')}.\nFecha AAAA-MM-DD. Empresa: DIBOS, REDISSA o REDISSA & DIBOS. Tras cada cambio usa la versión indicada por el nuevo botón Corregir.`, buttons: buttons(r)};
    if (action === 'retry' && enabled('extraer_factura')) {
      const updated = await this.reading(sender, id, account);
      return this.permitted(account, sender, false) ? {text: ficha(updated), buttons: buttons(updated)} : null;
    }
    const code = {confirm: 'confirmar_cobro', discard: 'descartar_factura', efectivo: 'cambiar_cobro', tarjeta: 'cambiar_cobro', transferencia: 'cambiar_cobro'}[action];
    if (!enabled(code)) throw new UserError('Función desactivada.');
    const changed = this.store.change(sender, id, revision, ['confirm','discard'].includes(action) ? action : 'payment', action);
    return {text: ficha(changed), buttons: buttons(changed)};
  }
}

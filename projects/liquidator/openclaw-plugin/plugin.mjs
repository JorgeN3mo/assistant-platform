import {Controller} from './controller.mjs';
import {UserError} from './store.mjs';
import {isExtractionRun} from './extract.mjs';

export default {
  id: 'liquidator', name: 'Liquidator',
  register(api) {
    const controller = new Controller({config: () => api.runtime.config.current(), runtime: api.runtime, options: api.pluginConfig, logger: api.logger});
    // Catch errors inside claim hooks: a thrown claim must never fall through into a chat model.
    api.on('reply_dispatch', async (event, context) => {
      const c = event.ctx;
      if ((c.Provider ?? c.Surface) !== 'telegram' || c.AccountId !== controller.options.accountId) return;
      let queuedFinal = false;
      try {
        const replies = await controller.incoming({account: c.AccountId, sender: String(c.SenderId ?? ''), isGroup: c.ChatType !== 'direct',
          messageId: c.MessageSidFull ?? c.MessageSid,
          text: c.BodyForCommands ?? c.CommandBody ?? c.RawBody ?? '', media: c.media ?? []});
        for (const reply of replies) queuedFinal = context.dispatcher.sendFinalReply(reply) || queuedFinal;
      } catch (error) {
        if (controller.permitted(c.AccountId, String(c.SenderId ?? ''), c.ChatType !== 'direct')) {
          queuedFinal = context.dispatcher.sendFinalReply({text: error instanceof UserError ? error.message : 'No se pudo completar la operación. Abre /pendientes para revisar lo guardado.'});
        }
        api.logger.warn('Liquidator: operación interrumpida; no se inicia conversación libre.');
      }
      context.recordProcessed('completed', {reason: 'liquidator_closed_dispatch'});
      context.markIdle('message_completed');
      return {handled: true, queuedFinal, counts: context.dispatcher.getQueuedCounts()};
    }, {priority: 1000});
    // A second fail-closed gate prevents a normal agent run if dispatch is bypassed.
    api.on('before_agent_run', (_event, context) => {
      if (context.agentId === 'liki' && !isExtractionRun(context.runId)) return {outcome: 'block', reason: 'Liquidator only permits its closed invoice workflow', message: 'Usa el flujo de facturas de Liki. /ayuda'};
    }, {priority: 1000});
    api.registerInteractiveHandler({channel: 'telegram', namespace: 'liq', handler: async context => {
      if (!context.auth.isAuthorizedSender) return {handled: true};
      try {
        const result = await controller.callback({account: context.accountId, sender: String(context.senderId ?? ''), isGroup: context.isGroup, data: context.callback.payload});
        if (result?.submitText) return {handled: true, submitText: result.submitText};
        if (result) await context.respond.reply(result);
      } catch (error) {
        if (controller.permitted(context.accountId, String(context.senderId ?? ''), context.isGroup)) await context.respond.reply({text: error instanceof UserError ? error.message : 'No se pudo completar la acción. Abre /pendientes.'});
      }
      return {handled: true};
    }});
    api.registerService({id: 'liquidator', start() {}, stop() { controller.close(); }});
  }
};

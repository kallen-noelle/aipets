/**
 * 插件运行上下文：交给 `setup(ctx)` 的 kits 与 modules。
 *
 * 目前只提供游戏模块套件 `kit.gamelet`。
 */

const { createDisposableStore } = require('./manifest.cjs')

const GAMELET_KIT_ID = 'kit.gamelet'

function createKitRegistry(record, sessionId, subscriptions, gamelets, moduleId) {
  const runtime = {
    extensionId: record.manifest.id,
    sessionId,
    moduleId,
    subscriptions,
    bindings: {
      bind: input => gamelets.bind(record, input),
    },
    gamelets: {
      open: bindingId => gamelets.open(record, bindingId),
      configure() {},
      request() {
        throw new Error('这个外壳不提供游戏请求通道。')
      },
      close: bindingId => gamelets.close(record, bindingId),
      isOpen: bindingId => gamelets.isOpen(record, bindingId),
    },
  }

  const registry = {
    async use(kit) {
      if (!kit || kit.id !== GAMELET_KIT_ID)
        throw new Error(`外壳不提供 ${kit?.id ?? '未知'} 套件。`)
      return kit.createClient(runtime)
    },
    async tryUse(kit) {
      try {
        return { ok: true, client: await registry.use(kit) }
      }
      catch (error) {
        return {
          ok: false,
          reason: 'missing-kit',
          error: error instanceof Error ? error : new Error(String(error)),
        }
      }
    },
    watch(kit, callback) {
      let disposed = false
      void registry.use(kit)
        .then(client => !disposed && callback({ available: true, kit, client }))
        .catch(error => !disposed && callback({
          available: false,
          kit,
          reason: 'missing-kit',
          error: error instanceof Error ? error : new Error(String(error)),
        }))

      return {
        dispose() {
          disposed = true
        },
      }
    },
  }

  return registry
}

/** 构造传给插件 `setup` 的上下文。 */
function createContext(record, sessionId, subscriptions, gamelets) {
  return {
    extension: { id: record.manifest.id, sessionId },
    subscriptions,
    kits: createKitRegistry(record, sessionId, subscriptions, gamelets, undefined),
    modules: {
      register: async (input) => {
        const moduleId = input?.id
        if (typeof moduleId !== 'string' || moduleId === '')
          throw new Error('模块需要有 id。')

        const moduleSubscriptions = createDisposableStore()
        record.moduleSubscriptions.set(moduleId, moduleSubscriptions)

        return {
          id: moduleId,
          kits: createKitRegistry(record, sessionId, moduleSubscriptions, gamelets, moduleId),
          subscriptions: moduleSubscriptions,
          dispose: async () => {
            moduleSubscriptions.dispose()
            record.moduleSubscriptions.delete(moduleId)
          },
        }
      },
    },
  }
}

module.exports = { createContext }

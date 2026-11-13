/**
 * 记忆注入中间件。
 *
 * 在每次模型调用（包括工具轮次）前，按当前实例与用户输入挑选预算内的记忆，
 * 作为独立的系统片段附加到 systemMessage 上，不改动角色卡的人设文本。
 * 读取或格式化失败时只记录状态，不阻断本轮对话。
 */

import { createMiddleware, type BaseMessage } from 'langchain'

import {
  briefMemoryError,
  selectMemories,
  useMemoryStore,
  type MemoryScope,
} from '@/config/domains/memory'

/** 取最后一条用户输入，作为挑选记忆的线索。 */
function lastHumanText(messages: BaseMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message && message.getType() === 'human')
      return message.text
  }
  return ''
}

export function memoryInjectionMiddleware(scope: MemoryScope) {
  return createMiddleware({
    name: 'MemoryInjection',
    wrapModelCall: async (request, handler) => {
      const store = useMemoryStore.getState()
      if (!store.longTermEnabled || !store.middlewareEnabled)
        return handler(request)

      try {
        const selection = selectMemories({
          entries: store.entries,
          instanceId: scope.instanceId,
          query: lastHumanText(request.messages),
        })
        store.recordInjection({
          at: Date.now(),
          ok: true,
          count: selection.count,
          chars: selection.chars,
        })

        if (!selection.text)
          return handler(request)

        // 单独一段系统片段，和角色卡的人设分开，方便排查注入内容。
        return await handler({
          ...request,
          systemMessage: request.systemMessage.concat(`\n\n${selection.text}`),
        })
      }
      catch (error) {
        useMemoryStore.getState().recordInjection({
          at: Date.now(),
          ok: false,
          error: briefMemoryError(error),
        })
        return handler(request)
      }
    },
  })
}

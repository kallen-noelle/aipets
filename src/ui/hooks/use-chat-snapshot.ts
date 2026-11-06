/**
 * 对话控制器的 React 适配层。
 *
 * 只做订阅，不含业务规则。
 */

import { useSyncExternalStore } from 'react'

import { chatController, type ChatSnapshot } from '@/llm/chat-controller'

export function useChatSnapshot(): ChatSnapshot {
  return useSyncExternalStore(
    listener => chatController.subscribe(listener),
    () => chatController.getSnapshot(),
    () => chatController.getSnapshot(),
  )
}

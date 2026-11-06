/**
 * 数据导入导出。
 *
 * 只处理聊天记录与提供商；清空全部配置会删除所有 `aipets:` 前缀的键。
 */

import { STORAGE_PREFIX } from './persistence'
import { useProvidersStore } from './domains/providers'
import { useSessionsStore, type ChatSession } from './domains/sessions'

/** 导出聊天记录的 JSON 文本。 */
export function exportSessions(): string {
  const { sessions } = useSessionsStore.getState()
  return JSON.stringify({ version: 1, sessions }, null, 2)
}

/** 导入聊天记录。格式不合法时抛错。 */
export function importSessions(raw: string): void {
  const parsed = JSON.parse(raw) as { sessions?: unknown }
  if (!Array.isArray(parsed.sessions))
    throw new Error('文件里没有 sessions 列表')

  useSessionsStore.getState().replaceSessions(parsed.sessions as ChatSession[])
}

/** 删除全部聊天记录。 */
export function clearSessions(): void {
  useSessionsStore.getState().clearSessions()
}

/** 把提供商恢复成默认值。 */
export function resetProviders(): void {
  useProvidersStore.getState().reset()
}

/** 清空所有以 aipets: 开头的本地配置。 */
export function clearAllData(): void {
  const keys = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key?.startsWith(`${STORAGE_PREFIX}:`))
      keys.push(key)
  }

  for (const key of keys)
    localStorage.removeItem(key)
}

/**
 * 记忆工具：检索、写入、遗忘。
 *
 * 工具与自动提取共用 store 里的同一套 upsert 规则，不能绕过来源与归属判断。
 * 工具默认开启：不依赖外部密钥、调用成本低，而且能让模型在不确定时先查记忆，
 * 减少凭空编造。
 */

import { tool } from 'langchain'
import { z } from 'zod'

import {
  briefMemoryError,
  useMemoryStore,
  type MemoryEntry,
  type MemoryScope,
} from '@/config/domains/memory'
import type { AgentTool } from '@/mcp/tools'

/** 一次最多返回的条目数，避免把整库塞给模型。 */
const SEARCH_LIMIT = 5
/** 单次工具输出的字符上限。 */
const OUTPUT_LIMIT = 600
/** 单条结果的字符上限。 */
const LINE_LIMIT = 160

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function lineOf(entry: MemoryEntry): string {
  const head = entry.description.trim()
    ? `${entry.name}（${entry.description.trim()}）`
    : entry.name
  return truncate(`- ${head}：${entry.content}`, LINE_LIMIT)
}

function searchTool(scope: MemoryScope): AgentTool {
  return tool(
    async ({ query }) => {
      const store = useMemoryStore.getState()
      try {
        const hits = store.search(query, scope, SEARCH_LIMIT)
        store.recordToolCall({ name: 'memory_search', at: Date.now() })
        if (hits.length === 0)
          return '记忆里没有找到相关内容。'
        return truncate(hits.map(lineOf).join('\n'), OUTPUT_LIMIT)
      }
      catch (error) {
        store.recordToolCall({ name: 'memory_search', at: Date.now(), error: briefMemoryError(error) })
        return '记忆检索失败，请不要编造记忆内容。'
      }
    },
    {
      name: 'memory_search',
      description: '检索长期记忆。当你不确定是否记得主人的信息、偏好或约定时，先检索，不要凭空编造。',
      schema: z.object({
        query: z.string().min(1).describe('检索关键词，例如“口味”或“生日”'),
      }),
    },
  )
}

function rememberTool(scope: MemoryScope): AgentTool {
  return tool(
    async ({ name, description, content }) => {
      const store = useMemoryStore.getState()
      try {
        const result = store.remember({ name, description, content }, scope)
        store.recordToolCall({ name: 'memory_remember', at: Date.now() })
        return result.updated > 0 ? `已更新记忆：${name}` : `已记住：${name}`
      }
      catch (error) {
        store.recordToolCall({ name: 'memory_remember', at: Date.now(), error: briefMemoryError(error) })
        return '记忆写入失败。'
      }
    },
    {
      name: 'memory_remember',
      description: '当主人明确说明需要长期记住的信息时写入记忆。只记录用户亲口确认的内容，不要记录你的猜测。',
      schema: z.object({
        name: z.string().min(1).describe('简短名称，例如“主人的生日”'),
        description: z.string().max(60).default('').describe('一句话说明'),
        content: z.string().min(1).describe('完整内容，包含必要上下文'),
      }),
    },
  )
}

function forgetTool(scope: MemoryScope): AgentTool {
  return tool(
    async ({ name }) => {
      const store = useMemoryStore.getState()
      try {
        const removed = store.forget(name, scope)
        store.recordToolCall({ name: 'memory_forget', at: Date.now() })
        return removed > 0 ? `已忘记 ${removed} 条相关记忆。` : '没有找到要忘记的记忆。'
      }
      catch (error) {
        store.recordToolCall({ name: 'memory_forget', at: Date.now(), error: briefMemoryError(error) })
        return '遗忘操作失败。'
      }
    },
    {
      name: 'memory_forget',
      description: '当主人明确要求你忘记某条记忆时，按名称删除。不要自行删除用户没有要求删除的内容。',
      schema: z.object({
        name: z.string().min(1).describe('要忘记的记忆名称'),
      }),
    },
  )
}

/** 按设置返回记忆工具；长期记忆关闭时整体不提供。 */
export function memoryTools(scope: MemoryScope): AgentTool[] {
  const store = useMemoryStore.getState()
  if (!store.longTermEnabled || !store.toolsEnabled)
    return []

  return [searchTool(scope), rememberTool(scope), forgetTool(scope)]
}

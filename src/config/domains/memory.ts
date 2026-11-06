/**
 * 记忆域：角色记住的条目。
 *
 * 条目由对话后的结构化提取写入，也可以在设置页手动增删改。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const memoryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, '请填写名称'),
  description: z.string().max(60, '一句话说明不超过 60 字'),
  content: z.string().min(1, '请填写内容'),
  createdAt: z.number(),
  /** 所属实例；空值表示所有实例共享。 */
  instanceId: z.string().optional(),
})

export type MemoryEntry = z.infer<typeof memoryEntrySchema>

export const memorySettingsSchema = z.object({
  /** 是否把历史消息发给模型。 */
  shortTermEnabled: z.boolean(),
  /** 保留的历史消息条数。 */
  shortTermWindow: z.number().min(2).max(50),
  /** 是否把记忆条目注入系统提示词。 */
  longTermEnabled: z.boolean(),
})

export type MemorySettings = z.infer<typeof memorySettingsSchema>

interface MemoryState extends MemorySettings {
  entries: MemoryEntry[]
  updateSettings: (patch: Partial<MemorySettings>) => void
  add: (entry: Omit<MemoryEntry, 'id' | 'createdAt'>) => void
  update: (id: string, patch: Partial<Omit<MemoryEntry, 'id'>>) => void
  remove: (id: string) => void
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    set => ({
      entries: [],
      shortTermEnabled: true,
      shortTermWindow: 12,
      longTermEnabled: true,
      updateSettings: patch => set(patch),
      add: entry => set(state => ({
        entries: [
          ...state.entries,
          {
            ...entry,
            id: `mem-${Date.now()}-${state.entries.length}`,
            createdAt: Date.now(),
          },
        ],
      })),
      update: (id, patch) => set(state => ({
        entries: state.entries.map(item => item.id === id ? { ...item, ...patch } : item),
      })),
      remove: id => set(state => ({
        entries: state.entries.filter(item => item.id !== id),
      })),
    }),
    persistOptions<MemoryState>('memory'),
  ),
)

/** 供提示词组装使用的记忆摘要：共享条目加上指定实例自己的条目。 */
export function memorySummary(instanceId?: string): string {
  const { entries } = useMemoryStore.getState()
  return entries
    .filter(entry => !entry.instanceId || entry.instanceId === instanceId)
    .map((entry) => {
      // 没有描述时正文就是全部信息。有描述时正文另起一行一起注入。
      if (!entry.description.trim())
        return `- ${entry.name}：${entry.content}`

      return `- ${entry.name}：${entry.description}\n  ${entry.content}`
    })
    .join('\n')
}

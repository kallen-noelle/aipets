/**
 * 记忆 store：把纯策略接到 zustand 与持久化上。
 *
 * 所有写入路径（设置页、模型工具、自动提取）都调用这里的动作，避免出现
 * 两套不一致的写规则。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../../persistence'
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUS,
  MANUAL_CONFIDENCE,
  normalizeMemoryName,
  searchMemoryEntries,
  upsertMemoryEntries,
  type MemoryEntry,
  type MemoryRuntimeStatus,
  type MemoryScope,
  type MemorySettings,
  type MemoryWrite,
  type UpsertResult,
} from './policy'
import { mergeStored, migrateStored } from './persist'

export interface MemoryState extends MemorySettings, MemoryRuntimeStatus {
  entries: MemoryEntry[]
  updateSettings: (patch: Partial<MemorySettings>) => void
  /** 手动写入或修改一条记忆，来源标记为 manual。 */
  remember: (write: MemoryWrite, scope: MemoryScope) => UpsertResult
  /** 自动提取写入，只更新同名的自动条目。 */
  upsertExtracted: (writes: MemoryWrite[], scope: MemoryScope) => UpsertResult
  update: (id: string, patch: Partial<Omit<MemoryEntry, 'id' | 'createdAt'>>) => void
  remove: (id: string) => void
  /** 按名称遗忘当前作用域内的条目，返回删除条数。 */
  forget: (name: string, scope: MemoryScope) => number
  /** 删除某个实例自己的记忆，实例被移除时调用。 */
  removeByInstance: (instanceId: string) => void
  search: (query: string, scope: MemoryScope, limit?: number) => MemoryEntry[]
  recordExtraction: (result: { at: number, ok: boolean, count?: number, error?: string }) => void
  recordInjection: (result: { at: number, ok: boolean, count?: number, chars?: number, error?: string }) => void
  recordToolCall: (result: { name: string, at: number, error?: string }) => void
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      ...DEFAULT_STATUS,
      entries: [],
      updateSettings: patch => set(patch),
      remember: (write, scope) => {
        const result = upsertMemoryEntries(get().entries, [write], {
          scope,
          source: 'manual',
          now: Date.now(),
        })
        set({ entries: result.entries })
        return result
      },
      upsertExtracted: (writes, scope) => {
        const result = upsertMemoryEntries(get().entries, writes, {
          scope,
          source: 'extracted',
          now: Date.now(),
        })
        set({ entries: result.entries })
        return result
      },
      update: (id, patch) => set(state => ({
        entries: state.entries.map(item => item.id === id
          ? { ...item, ...patch, source: 'manual', confidence: MANUAL_CONFIDENCE, updatedAt: Date.now() }
          : item),
      })),
      remove: id => set(state => ({
        entries: state.entries.filter(item => item.id !== id),
      })),
      forget: (name, scope) => {
        const key = normalizeMemoryName(name)
        if (!key)
          return 0

        const before = get().entries.length
        const entries = get().entries.filter(entry =>
          !(!entry.instanceId || entry.instanceId === scope.instanceId)
          || normalizeMemoryName(entry.name) !== key,
        )
        set({ entries })
        return before - entries.length
      },
      removeByInstance: instanceId => set(state => ({
        entries: state.entries.filter(entry => entry.instanceId !== instanceId),
      })),
      search: (query, scope, limit = 5) => searchMemoryEntries(get().entries, query, scope, limit),
      recordExtraction: result => set({
        lastExtractAt: result.at,
        lastExtractOk: result.ok,
        lastExtractCount: result.count ?? 0,
        lastExtractError: result.ok ? null : (result.error ?? '未知错误'),
      }),
      recordInjection: result => set({
        lastInjectAt: result.at,
        lastInjectOk: result.ok,
        lastInjectCount: result.count ?? 0,
        lastInjectChars: result.chars ?? 0,
        lastInjectError: result.ok ? null : (result.error ?? '未知错误'),
      }),
      recordToolCall: result => set(state => ({
        toolCallCount: state.toolCallCount + 1,
        lastToolName: result.name,
        lastToolAt: result.at,
        lastToolError: result.error ?? null,
      })),
    }),
    // 版本 2：条目新增来源、置信度与更新时间，旧版本数据由 migrateStored 补齐。
    persistOptions<MemoryState, Partial<MemoryState>>('memory', 2, mergeStored, migrateStored),
  ),
)

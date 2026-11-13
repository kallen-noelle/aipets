/**
 * 记忆持久化：旧版本数据归一化与合并。
 *
 * 与 store 分开放置，迁移逻辑可以单独测试。这里只依赖纯策略，不接触 UI。
 */

import {
  clamp,
  isFiniteNumber,
  isRecord,
  normalizeMemoryEntry,
  type MemoryEntry,
  type MemoryRuntimeStatus,
  type MemorySettings,
} from './policy'
import type { MemoryState } from './store'

/** 归一化设置，缺失或越界的值回退到当前默认值。 */
function normalizeSettings(value: Record<string, unknown>): Partial<MemorySettings> {
  const patch: Partial<MemorySettings> = {}
  if (typeof value.shortTermEnabled === 'boolean')
    patch.shortTermEnabled = value.shortTermEnabled
  if (isFiniteNumber(value.shortTermWindow))
    patch.shortTermWindow = clamp(value.shortTermWindow, 2, 50)
  if (typeof value.longTermEnabled === 'boolean')
    patch.longTermEnabled = value.longTermEnabled
  if (typeof value.middlewareEnabled === 'boolean')
    patch.middlewareEnabled = value.middlewareEnabled
  if (typeof value.toolsEnabled === 'boolean')
    patch.toolsEnabled = value.toolsEnabled
  return patch
}

function normalizeStatus(value: Record<string, unknown>): Partial<MemoryRuntimeStatus> {
  const patch: Partial<MemoryRuntimeStatus> = {}
  if (isFiniteNumber(value.lastExtractAt))
    patch.lastExtractAt = value.lastExtractAt
  if (typeof value.lastExtractOk === 'boolean')
    patch.lastExtractOk = value.lastExtractOk
  if (isFiniteNumber(value.lastExtractCount))
    patch.lastExtractCount = value.lastExtractCount
  if (typeof value.lastExtractError === 'string')
    patch.lastExtractError = value.lastExtractError
  if (isFiniteNumber(value.lastInjectAt))
    patch.lastInjectAt = value.lastInjectAt
  if (typeof value.lastInjectOk === 'boolean')
    patch.lastInjectOk = value.lastInjectOk
  if (isFiniteNumber(value.lastInjectCount))
    patch.lastInjectCount = value.lastInjectCount
  if (isFiniteNumber(value.lastInjectChars))
    patch.lastInjectChars = value.lastInjectChars
  if (typeof value.lastInjectError === 'string')
    patch.lastInjectError = value.lastInjectError
  if (isFiniteNumber(value.toolCallCount))
    patch.toolCallCount = value.toolCallCount
  if (typeof value.lastToolName === 'string')
    patch.lastToolName = value.lastToolName
  if (isFiniteNumber(value.lastToolAt))
    patch.lastToolAt = value.lastToolAt
  if (typeof value.lastToolError === 'string')
    patch.lastToolError = value.lastToolError
  return patch
}

/** 把任意旧快照归一化成可用的部分状态，供 merge 与 migrate 共用。 */
export function migrateStored(persisted: unknown): Partial<MemoryState> {
  if (!isRecord(persisted))
    return {}

  const patch: Partial<MemoryState> = {
    ...normalizeSettings(persisted),
    ...normalizeStatus(persisted),
  }

  if (Array.isArray(persisted.entries)) {
    patch.entries = persisted.entries
      .map(normalizeMemoryEntry)
      .filter((entry): entry is MemoryEntry => entry !== null)
  }

  return patch
}

/** 合并时以归一化后的旧数据覆盖当前默认值，缺失字段保留默认。 */
export function mergeStored(persisted: unknown, current: MemoryState): MemoryState {
  return { ...current, ...migrateStored(persisted) }
}

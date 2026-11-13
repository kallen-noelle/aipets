/**
 * 临时调试监控：把导演、舞台、跨窗口事件与聊天状态汇总到页面浮层。
 *
 * 只用于排查“对话后角色不放风筝”这类链路问题，验证完成后可以删除。
 */

import type { CharacterStateName } from '@/character/types'

export type DebugSource = 'emit' | 'stage' | 'director' | 'ambient' | 'chat'

export interface DebugEvent {
  id: number
  at: number
  source: DebugSource
  kind: string
  detail: string
  /** 事件所属实例；聊天等全局事件为空。 */
  instanceId?: string
}

export interface DebugVideo {
  active: boolean
  src: string
  paused: boolean
  loop: boolean
  currentTime: number | null
  duration: number | null
  error: string | null
}

export interface StageDebugSnapshot {
  at: number
  instanceId: string
  performing: boolean
  ambientActive: boolean
  ambientClipIndex: number | null
  ambientPaused: boolean
  state: CharacterStateName | null
  videos: DebugVideo[]
}

export interface DebugSnapshot {
  events: DebugEvent[]
  /** 按实例保存的舞台快照，顺序为首次上报顺序。 */
  stages: StageDebugSnapshot[]
}

const MAX_EVENTS = 40
const listeners = new Set<() => void>()

let events: DebugEvent[] = []
const stages = new Map<string, StageDebugSnapshot>()
let nextId = 1
let snapshot: DebugSnapshot = { events, stages: [] }

function notify(): void {
  // 每次变化生成新对象，useSyncExternalStore 才能判定更新。
  snapshot = { events, stages: [...stages.values()] }
  for (const listener of listeners)
    listener()
}

/** 记录一条调试事件。传入 instanceId 后只出现在该实例的监控面板里。 */
export function recordDebugEvent(
  source: DebugSource,
  kind: string,
  detail = '',
  instanceId?: string,
): void {
  if (!import.meta.env.DEV)
    return

  const event: DebugEvent = {
    id: nextId++,
    at: Date.now(),
    source,
    kind,
    detail: detail.slice(0, 300),
    ...(instanceId ? { instanceId } : {}),
  }
  events = [...events.slice(-(MAX_EVENTS - 1)), event]
  notify()
}

/** 舞台每 500 毫秒上报一次运行时状态，按实例覆盖。 */
export function publishStageDebug(next: StageDebugSnapshot): void {
  if (!import.meta.env.DEV || !next.instanceId)
    return

  stages.set(next.instanceId, next)
  notify()
}

/** 实例卸载后移除它的舞台快照，避免留下过期数据。 */
export function removeStageDebug(instanceId: string): void {
  if (!import.meta.env.DEV || !instanceId)
    return

  if (!stages.delete(instanceId))
    return

  notify()
}

/** 清空已记录事件；传 instanceId 时只清该实例。 */
export function clearDebugEvents(instanceId?: string): void {
  events = instanceId
    ? events.filter(event => event.instanceId !== instanceId)
    : []
  notify()
}

export function subscribeDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDebugSnapshot(): DebugSnapshot {
  return snapshot
}

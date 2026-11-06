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
  stage: StageDebugSnapshot | null
}

const MAX_EVENTS = 40
const listeners = new Set<() => void>()

let events: DebugEvent[] = []
let stage: StageDebugSnapshot | null = null
let nextId = 1
let snapshot: DebugSnapshot = { events, stage }

function notify(): void {
  // 每次变化生成新对象，useSyncExternalStore 才能判定更新。
  snapshot = { events, stage }
  for (const listener of listeners)
    listener()
}

/** 记录一条调试事件。 */
export function recordDebugEvent(source: DebugSource, kind: string, detail = ''): void {
  if (!import.meta.env.DEV)
    return

  const event: DebugEvent = {
    id: nextId++,
    at: Date.now(),
    source,
    kind,
    detail: detail.slice(0, 300),
  }
  events = [...events.slice(-(MAX_EVENTS - 1)), event]
  notify()
}

/** 舞台每 500 毫秒上报一次运行时状态。 */
export function publishStageDebug(next: StageDebugSnapshot): void {
  if (!import.meta.env.DEV)
    return

  stage = next
  notify()
}

/** 清空已记录事件，舞台快照保留。 */
export function clearDebugEvents(): void {
  events = []
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

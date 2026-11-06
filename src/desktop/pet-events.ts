/**
 * 桌宠事件：聊天窗通知桌宠说话、回合开始、回复结束与表演计划。
 *
 * Electron 走 IPC 桥；网页版多个标签页时用 BroadcastChannel 传同一条消息。
 */

import type { PerformanceStep } from '@/character/perform'
import { recordDebugEvent } from '@/debug/monitor'

import { getDesktopBridge } from './bridge'

export type PetEvent =
  | { kind: 'speech-started' }
  | { kind: 'speech-ended' }
  | { kind: 'turn-started', instanceId: string }
  | { kind: 'reply-ended', instanceId: string }
  | { kind: 'perform', instanceId: string, steps: PerformanceStep[] }
  | { kind: 'ambient-refresh', instanceId: string }

const CHANNEL_NAME = 'aipets:pet-events'

let channel: BroadcastChannel | null = null
/** 同一页面里的聊天与舞台直接回调，BroadcastChannel 不会投递给自己。 */
const localListeners = new Set<(event: PetEvent) => void>()

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined')
    return null

  channel ??= new BroadcastChannel(CHANNEL_NAME)
  return channel
}

function isPetEvent(value: unknown): value is PetEvent {
  if (!value || typeof value !== 'object')
    return false

  const kind = (value as { kind?: unknown }).kind
  if (kind === 'speech-started' || kind === 'speech-ended')
    return true

  if (kind === 'turn-started' || kind === 'reply-ended' || kind === 'ambient-refresh')
    return typeof (value as { instanceId?: unknown }).instanceId === 'string'

  if (kind === 'perform') {
    const event = value as { instanceId?: unknown, steps?: unknown }
    return typeof event.instanceId === 'string'
      && Array.isArray(event.steps)
      && event.steps.every((step) => {
        if (!step || typeof step !== 'object')
          return false

        const { name, durationMs } = step as { name?: unknown, durationMs?: unknown }
        return typeof name === 'string'
          && (durationMs === undefined
            || (typeof durationMs === 'number' && Number.isFinite(durationMs)))
      })
  }

  return false
}

/** 发送事件。同页监听先收到，再走桌面桥或标签页广播。 */
export function emitPetEvent(event: PetEvent): void {
  recordDebugEvent('emit', event.kind, JSON.stringify(event))

  for (const listener of localListeners)
    listener(event)

  const bridge = getDesktopBridge()
  if (bridge) {
    bridge.sendPetEvent(event)
    return
  }

  getChannel()?.postMessage(event)
}

/** 订阅事件，返回取消函数。 */
export function onPetEvent(listener: (event: PetEvent) => void): () => void {
  localListeners.add(listener)
  const bridge = getDesktopBridge()
  const offBridge = bridge
    ? bridge.onPetEvent((payload) => {
        if (isPetEvent(payload))
          listener(payload)
      })
    : null

  const current = getChannel()
  if (!current) {
    return () => {
      localListeners.delete(listener)
      offBridge?.()
    }
  }

  const handler = (event: MessageEvent<unknown>) => {
    if (isPetEvent(event.data))
      listener(event.data)
  }

  current.addEventListener('message', handler)
  return () => {
    localListeners.delete(listener)
    offBridge?.()
    current.removeEventListener('message', handler)
  }
}

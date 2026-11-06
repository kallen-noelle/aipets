/**
 * 角色状态机。
 *
 * 状态只有五个，迁移规则集中在这里，方便测试与排查。驱动方是导演：
 * 导演把外部事件（说话开始、点击、拖拽）交给状态机，状态机只判定是否接受。
 */

import type { CharacterStateName } from './types'

/** 外部事件。 */
export type CharacterEvent =
  | { type: 'speech-started' }
  | { type: 'speech-ended' }
  | { type: 'petted' }
  | { type: 'drag-started' }
  | { type: 'drag-ended' }
  | { type: 'thought-started' }
  | { type: 'thought-ended' }

/**
 * 迁移表：当前状态 × 事件 → 下一个状态。
 *
 * `null` 表示事件被忽略。拖拽优先级最高，说话与点击都不能打断它。
 */
const TRANSITIONS: Record<CharacterStateName, Partial<Record<CharacterEvent['type'], CharacterStateName>>> = {
  idle: {
    'speech-started': 'speaking',
    'petted': 'petted',
    'drag-started': 'dragging',
    'thought-started': 'thinking',
  },
  speaking: {
    'speech-ended': 'idle',
    'drag-started': 'dragging',
    'thought-started': 'thinking',
  },
  thinking: {
    'thought-ended': 'idle',
    'drag-started': 'dragging',
    'speech-started': 'speaking',
  },
  petted: {
    'speech-started': 'speaking',
    'drag-started': 'dragging',
  },
  dragging: {
    'speech-started': 'speaking',
    'drag-ended': 'idle',
  },
}

export class CharacterStateMachine {
  private current: CharacterStateName = 'idle'
  private readonly listeners = new Set<(state: CharacterStateName) => void>()

  get state(): CharacterStateName {
    return this.current
  }

  /** 订阅状态变化，返回取消订阅函数。 */
  subscribe(listener: (state: CharacterStateName) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 下发事件。
   *
   * 状态没变时返回 false，导演据此避免重复播同一组片段。
   */
  dispatch(event: CharacterEvent): boolean {
    const next = TRANSITIONS[this.current][event.type]
    if (!next || next === this.current)
      return false

    this.current = next
    for (const listener of this.listeners)
      listener(next)
    return true
  }

  /** 一次性动作（点击回应）播完后回到 idle。 */
  finishTransient(): void {
    if (this.current !== 'petted')
      return

    this.current = 'idle'
    for (const listener of this.listeners)
      listener('idle')
  }

  /** 强制回到 idle，用于异常恢复。 */
  reset(): void {
    if (this.current === 'idle')
      return

    this.current = 'idle'
    for (const listener of this.listeners)
      listener('idle')
  }
}

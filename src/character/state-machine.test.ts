/**
 * 状态机的迁移表测试。
 */

import { describe, expect, it } from 'vitest'

import { CharacterStateMachine } from './state-machine'

describe('CharacterStateMachine', () => {
  it('从待机进入说话、思考与点击回应', () => {
    const machine = new CharacterStateMachine()
    expect(machine.dispatch({ type: 'speech-started' })).toBe(true)
    expect(machine.state).toBe('speaking')
  })

  it('点击回应播完回到待机', () => {
    const machine = new CharacterStateMachine()
    machine.dispatch({ type: 'petted' })
    expect(machine.state).toBe('petted')

    machine.finishTransient()
    expect(machine.state).toBe('idle')
  })

  it('拖拽优先级最高，能打断说话', () => {
    const machine = new CharacterStateMachine()
    machine.dispatch({ type: 'speech-started' })
    machine.dispatch({ type: 'drag-started' })
    expect(machine.state).toBe('dragging')
  })

  it('拖拽期间忽略点击', () => {
    const machine = new CharacterStateMachine()
    machine.dispatch({ type: 'drag-started' })
    expect(machine.dispatch({ type: 'petted' })).toBe(false)
    expect(machine.state).toBe('dragging')
  })

  it('松手后回到待机', () => {
    const machine = new CharacterStateMachine()
    machine.dispatch({ type: 'drag-started' })
    machine.dispatch({ type: 'drag-ended' })
    expect(machine.state).toBe('idle')
  })

  it('相同状态的事件返回 false', () => {
    const machine = new CharacterStateMachine()
    machine.dispatch({ type: 'speech-started' })
    machine.dispatch({ type: 'thought-started' })
    expect(machine.state).toBe('thinking')

    // 思考中再次触发思考事件，状态不变。
    expect(machine.dispatch({ type: 'thought-started' })).toBe(false)
  })

  it('状态变化会通知订阅者', () => {
    const machine = new CharacterStateMachine()
    const seen: string[] = []
    machine.subscribe(state => seen.push(state))

    machine.dispatch({ type: 'petted' })
    machine.finishTransient()

    expect(seen).toEqual(['petted', 'idle'])
  })
})

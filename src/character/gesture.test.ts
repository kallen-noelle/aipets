/**
 * 手势识别的测试。
 */

import { describe, expect, it } from 'vitest'

import { GestureRecognizer } from './gesture'

describe('GestureRecognizer', () => {
  it('原地松手算点击', () => {
    const gestures = new GestureRecognizer()
    gestures.down({ x: 100, y: 100, time: 1000 })
    expect(gestures.up({ x: 101, y: 100, time: 1200 })).toBe('tap')
  })

  it('位移超过阈值后进入拖拽', () => {
    const gestures = new GestureRecognizer({ threshold: 6 })
    gestures.down({ x: 100, y: 100, time: 1000 })

    expect(gestures.move({ x: 104, y: 102, time: 1100 })).toBeNull()
    expect(gestures.move({ x: 140, y: 100, time: 1200 })).toBe('drag-started')
    expect(gestures.up({ x: 160, y: 100, time: 1400 })).toBe('drag-ended')
  })

  it('拖拽过程中不再重复上报开始', () => {
    const gestures = new GestureRecognizer()
    gestures.down({ x: 0, y: 0, time: 0 })
    expect(gestures.move({ x: 80, y: 0, time: 100 })).toBe('drag-started')
    expect(gestures.move({ x: 160, y: 0, time: 200 })).toBeNull()
  })

  it('长按不触发点击回应', () => {
    const gestures = new GestureRecognizer({ tapMaxMs: 600 })
    gestures.down({ x: 10, y: 10, time: 0 })
    expect(gestures.up({ x: 10, y: 10, time: 900 })).toBeNull()
  })

  it('没有按下就松手时无结果', () => {
    expect(new GestureRecognizer().up({ x: 0, y: 0, time: 0 })).toBeNull()
  })
})

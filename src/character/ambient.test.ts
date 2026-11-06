import { describe, expect, it } from 'vitest'

import {
  ambientClipAt,
  parseAmbientProgram,
  totalHoldMs,
} from './ambient'

const hour = 3_600_000

const program = {
  clips: [
    { name: '东张西望' },
    { name: '悠闲哼歌', durationMs: 12 * hour },
    { name: '开心跃动' },
    { name: '写代码', durationMs: 12 * hour },
  ],
  reason: '白天哼歌，晚上写代码',
}

describe('parseAmbientProgram', () => {
  it('接受动作序列并把短片名称归一为对象', () => {
    const parsed = parseAmbientProgram({
      clips: ['东张西望', { name: '悠闲哼歌', durationMs: 4 * hour }],
      reason: '测试',
    })

    expect(parsed?.clips).toEqual([
      { name: '东张西望' },
      { name: '悠闲哼歌', durationMs: 4 * hour },
    ])
    expect(parsed?.reason).toBe('测试')
  })

  it('不限制动作数量、时长、重复和顺序', () => {
    const clips = Array.from({ length: 20 }, (_, index) => ({
      name: index % 2 ? '悠闲哼歌' : '东张西望',
      ...(index % 3 === 0 ? { durationMs: index + 1 } : {}),
    }))

    expect(parseAmbientProgram({ clips, reason: '' })).not.toBeNull()
    expect(parseAmbientProgram({
      clips: [
        { name: '写代码', durationMs: 0.4 * hour },
        { name: '悠闲哼歌', durationMs: 500 * hour },
        { name: '写代码', durationMs: 0.4 * hour },
      ],
      reason: '',
    })).not.toBeNull()
  })

  it('拒绝空序列和非正时长', () => {
    expect(parseAmbientProgram({ clips: [], reason: '' })).toBeNull()
    expect(parseAmbientProgram({
      clips: [{ name: '悠闲哼歌', durationMs: 0 }],
      reason: '',
    })).toBeNull()
  })
})

describe('totalHoldMs', () => {
  it('只累加长动作时长，短片不计时', () => {
    expect(totalHoldMs([
      { name: '东张西望' },
      { name: '悠闲哼歌', durationMs: 5 * hour },
      { name: '开心跃动' },
      { name: '写代码', durationMs: 19 * hour },
    ])).toBe(24 * hour)
  })
})

describe('ambientClipAt', () => {
  it('刚生成时从第一个动作开始', () => {
    expect(ambientClipAt(program, 1_000, 1_000)).toEqual({ clipIndex: 0 })
  })

  it('按已过的长动作时间定位到对应动作', () => {
    expect(ambientClipAt(program, 0, 15 * hour)).toEqual({
      clipIndex: 3,
      holdMs: 9 * hour,
    })
  })

  it('满一轮后从头开始', () => {
    expect(ambientClipAt(program, 0, 24 * hour)).toEqual({ clipIndex: 0 })
  })

  it('没有长动作时从头播放', () => {
    expect(ambientClipAt({
      clips: [{ name: '东张西望' }, { name: '开心跃动' }],
      reason: '',
    }, 0, 10 * hour)).toEqual({ clipIndex: 0 })
  })
})

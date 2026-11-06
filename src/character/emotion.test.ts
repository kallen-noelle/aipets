import { describe, expect, it } from 'vitest'

import { EmotionTracker, matchesEmotion } from './emotion'
import type { CharacterClip } from './types'

function clip(segments: string[], tags?: string[]): CharacterClip {
  return { segments, weight: 1, loop: false, ...(tags ? { tags } : {}) }
}

describe('matchesEmotion', () => {
  it('优先使用索引标签', () => {
    expect(matchesEmotion(clip(['animations/开心-跳跃.webm'], ['shy']), 'shy')).toBe(true)
    expect(matchesEmotion(clip(['animations/开心-跳跃.webm'], ['shy']), 'happy')).toBe(false)
  })

  it('没有标签时退回文件名关键词', () => {
    expect(matchesEmotion(clip(['animations/点击响应-害羞惊讶.webm']), 'shy')).toBe(true)
    expect(matchesEmotion(clip(['animations/哈欠连天.webm']), 'sleepy')).toBe(true)
    expect(matchesEmotion(clip(['animations/摇扇纳凉.webm']), 'angry')).toBe(false)
  })

  it('中性情绪不匹配任何片段', () => {
    expect(matchesEmotion(clip(['animations/开心-跳跃.webm'], ['happy']), 'neutral')).toBe(false)
  })
})

describe('EmotionTracker', () => {
  it('到期后回到中性', () => {
    let now = 0
    const tracker = new EmotionTracker({ durationMs: 1000, now: () => now, random: () => 0.1 })
    tracker.petted()

    expect(tracker.get()).toBe('happy')
    now = 1000
    expect(tracker.get()).toBe('neutral')
  })

  it('说话后立即恢复中性', () => {
    const tracker = new EmotionTracker({ durationMs: 10_000, random: () => 0.9, now: () => 0 })
    tracker.petted()

    expect(tracker.get()).toBe('shy')
    tracker.calm()
    expect(tracker.get()).toBe('neutral')
  })
})

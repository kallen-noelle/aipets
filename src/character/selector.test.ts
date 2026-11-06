/**
 * 选择器与情绪的测试，随机源固定，结果可断言。
 */

import { describe, expect, it } from 'vitest'

import { EmotionTracker, matchesEmotion } from './emotion'
import { ClipSelector } from './selector'
import type { CharacterClip } from './types'

function clip(name: string, weight = 1): CharacterClip {
  return { segments: [name], weight, loop: false }
}

describe('ClipSelector', () => {
  it('只有一个片段时直接返回', () => {
    const selector = new ClipSelector(() => 0)
    expect(selector.pick([clip('a')])?.segments).toEqual(['a'])
  })

  it('随机值为 0 时选第一个候选', () => {
    const selector = new ClipSelector(() => 0)
    expect(selector.pick([clip('a'), clip('b')])?.segments).toEqual(['a'])
  })

  it('随机值接近 1 时选最后一个', () => {
    const selector = new ClipSelector(() => 0.99)
    expect(selector.pick([clip('a'), clip('b')])?.segments).toEqual(['b'])
  })

  it('连续选择不会重复同一片段', () => {
    const selector = new ClipSelector(() => 0)
    const first = selector.pick([clip('a'), clip('b')])
    const second = selector.pick([clip('a'), clip('b')])

    expect(first?.segments).toEqual(['a'])
    expect(second?.segments).toEqual(['b'])
  })

  it('权重影响选择结果', () => {
    const selector = new ClipSelector(() => 0.5)
    // 总权重 4，随机点 2 落在第二个片段上。
    expect(selector.pick([clip('a', 1), clip('b', 3)])?.segments).toEqual(['b'])
  })

  it('空清单返回 null', () => {
    expect(new ClipSelector(() => 0).pick([])).toBeNull()
  })
})

describe('EmotionTracker', () => {
  it('点击后进入开心或害羞', () => {
    const tracker = new EmotionTracker({ random: () => 0 })
    expect(tracker.petted()).toBe('happy')

    const shyTracker = new EmotionTracker({ random: () => 0.9 })
    expect(shyTracker.petted()).toBe('shy')
  })

  it('拖拽让它不高兴', () => {
    const tracker = new EmotionTracker({ random: () => 0 })
    expect(tracker.dragged()).toBe('angry')
  })

  it('情绪到期回到中性', () => {
    let now = 1000
    const tracker = new EmotionTracker({ durationMs: 5000, random: () => 0, now: () => now })
    tracker.petted()

    expect(tracker.get()).toBe('happy')
    now += 4000
    expect(tracker.get()).toBe('happy')
    now += 2000
    expect(tracker.get()).toBe('neutral')
  })

  it('说话让情绪恢复中性', () => {
    const tracker = new EmotionTracker({ random: () => 0, now: () => 1000 })
    tracker.dragged()
    tracker.calm()

    expect(tracker.get()).toBe('neutral')
  })
})

describe('matchesEmotion', () => {
  it('按片段名关键词匹配情绪', () => {
    expect(matchesEmotion(clip('animations/点击回应-开心跃动.webm'), 'happy')).toBe(true)
    expect(matchesEmotion(clip('animations/点击回应-傲娇生气.webm'), 'angry')).toBe(true)
    expect(matchesEmotion(clip('animations/哈欠连天.webm'), 'sleepy')).toBe(true)
    expect(matchesEmotion(clip('animations/待机呼吸休闲.webm'), 'happy')).toBe(false)
  })

  it('中性情绪不匹配任何片段', () => {
    expect(matchesEmotion(clip('animations/点击回应-开心跃动.webm'), 'neutral')).toBe(false)
  })
})

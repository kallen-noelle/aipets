/**
 * 情绪：影响空闲时优先播放哪些情绪片段。
 *
 * 情绪不参与状态机，只是一个带寿命的偏好提示。点击、拖拽、长时间空闲会
 * 改变情绪，到期自动回到中性。
 */

import type { CharacterClip } from './types'

export type Emotion = 'neutral' | 'happy' | 'shy' | 'angry' | 'sleepy'

/** 情绪对应的片段名关键词，资源命名是中文，按子串匹配。 */
const EMOTION_KEYWORDS: Record<Exclude<Emotion, 'neutral'>, string[]> = {
  happy: ['开心', '雀跃', '轻快', '哼歌'],
  shy: ['害羞', '礼仪'],
  angry: ['生气', '气急败坏', '傲娇'],
  sleepy: ['哈欠', '瞌睡', '小憩', '伸懒腰'],
}

/** 片段是否契合某种情绪。优先用索引里的标签，缺失时退回文件名关键词。 */
export function matchesEmotion(clip: CharacterClip, emotion: Emotion): boolean {
  if (emotion === 'neutral')
    return false

  // 索引给了标签就以标签为准，标签和文件名冲突时信任索引。
  if (clip.tags && clip.tags.length > 0)
    return clip.tags.includes(emotion)

  const name = clip.segments.join(' ')
  return EMOTION_KEYWORDS[emotion].some(keyword => name.includes(keyword))
}

export interface EmotionTrackerOptions {
  /** 情绪持续时间，毫秒。 */
  durationMs?: number
  random?: () => number
  now?: () => number
}

export class EmotionTracker {
  private readonly durationMs: number
  private readonly random: () => number
  private readonly now: () => number
  private current: Emotion = 'neutral'
  private expiresAt = 0

  constructor(options: EmotionTrackerOptions = {}) {
    this.durationMs = options.durationMs ?? 30_000
    this.random = options.random ?? Math.random
    this.now = options.now ?? Date.now
  }

  /** 当前有效情绪，超时后自动回到中性。 */
  get(): Emotion {
    if (this.current !== 'neutral' && this.now() >= this.expiresAt)
      this.current = 'neutral'

    return this.current
  }

  /** 被点击：开心或害羞随机。 */
  petted(): Emotion {
    return this.set(this.random() < 0.6 ? 'happy' : 'shy')
  }

  /** 被拖拽：不高兴。 */
  dragged(): Emotion {
    return this.set('angry')
  }

  /** 长时间空闲：犯困。 */
  bored(): Emotion {
    return this.set('sleepy')
  }

  /** 开口说话后情绪恢复正常。 */
  calm(): void {
    this.current = 'neutral'
    this.expiresAt = 0
  }

  private set(emotion: Emotion): Emotion {
    this.current = emotion
    this.expiresAt = this.now() + this.durationMs
    return emotion
  }
}

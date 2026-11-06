/**
 * 片段选择器：按权重随机，并避免连续选中同一片段。
 *
 * 随机源可注入，测试用固定序列就能断言结果。
 */

import type { CharacterClip } from './types'

/** 片段身份，用于判重。 */
export function clipId(clip: CharacterClip): string {
  return clip.segments.join('|')
}

export class ClipSelector {
  private readonly random: () => number
  private lastId: string | null = null

  constructor(random: () => number = Math.random) {
    this.random = random
  }

  /**
   * 选一个片段。
   *
   * 候选多于一个时会排除上一次选中的片段，保证不连播同一个。
   */
  pick(clips: CharacterClip[]): CharacterClip | null {
    if (clips.length === 0)
      return null
    if (clips.length === 1) {
      this.lastId = clipId(clips[0])
      return clips[0]
    }

    const candidates = clips.filter((clip) => {
      const id = clipId(clip)
      return id !== this.lastId
    })
    const pool = candidates.length > 0 ? candidates : clips
    const total = pool.reduce((sum, clip) => sum + clip.weight, 0)

    let target = this.random() * total
    let chosen = pool[pool.length - 1]
    for (const clip of pool) {
      target -= clip.weight
      if (target <= 0) {
        chosen = clip
        break
      }
    }

    this.lastId = clipId(chosen)
    return chosen
  }

  /** 清空判重记录，失败重试时用。 */
  reset(): void {
    this.lastId = null
  }
}

/**
 * 动画域：导演使用的模型。
 *
 * 留空时跟随当前对话模型，两者都为空才关闭 LLM 导演。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const animationSchema = z.object({
  directorModel: z.string(),
  /** 最近一次导演结果，供设置页排查。 */
  lastClips: z.array(z.string()),
  lastReason: z.string(),
  lastError: z.string(),
})

export type AnimationConfig = z.infer<typeof animationSchema>

interface AnimationState extends AnimationConfig {
  update: (patch: Partial<AnimationConfig>) => void
}

export const useAnimationStore = create<AnimationState>()(
  persist(
    set => ({
      directorModel: '',
      lastClips: [],
      lastReason: '',
      lastError: '',
      update: patch => set(patch),
    }),
    persistOptions<AnimationState>('animation'),
  ),
)

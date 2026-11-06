/**
 * 视觉域：图片理解使用的提供商与模型。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const visionSchema = z.object({
  providerId: z.string(),
  model: z.string(),
  useForChat: z.boolean(),
  /** 工具轮次是否改用视觉模型。 */
  useForToolImages: z.boolean(),
})

export type VisionConfig = z.infer<typeof visionSchema>

interface VisionState extends VisionConfig {
  update: (patch: Partial<VisionConfig>) => void
}

export const useVisionStore = create<VisionState>()(
  persist(
    set => ({
      providerId: '',
      model: '',
      useForChat: false,
      useForToolImages: false,
      update: patch => set(patch),
    }),
    persistOptions<VisionState>('vision'),
  ),
)

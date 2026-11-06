/**
 * 图像域：生成图片的开关与尺寸。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const imageSchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
  size: z.string(),
})

export type ImageConfig = z.infer<typeof imageSchema>

interface ImageState extends ImageConfig {
  update: (patch: Partial<ImageConfig>) => void
}

export const useImageStore = create<ImageState>()(
  persist(
    set => ({
      enabled: false,
      model: 'dall-e-3',
      size: '1024x1024',
      update: patch => set(patch),
    }),
    persistOptions<ImageState>('image'),
  ),
)

/**
 * 音乐域：弹琴与唱歌共用的开关与音量。
 *
 * 两个能力都只靠 Web Audio 合成，不需要密钥或外部接口。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const musicSchema = z.object({
  /** 总开关，关闭后两个工具都不会出现在模型可调用列表里。 */
  enabled: z.boolean(),
  pianoEnabled: z.boolean(),
  singingEnabled: z.boolean(),
  /** 合成音量，0–1。 */
  volume: z.number().min(0).max(1),
})

export type MusicConfig = z.infer<typeof musicSchema>

interface MusicState extends MusicConfig {
  update: (patch: Partial<MusicConfig>) => void
}

export const useMusicStore = create<MusicState>()(
  persist(
    set => ({
      enabled: true,
      pianoEnabled: true,
      singingEnabled: true,
      volume: 0.6,
      update: patch => set(patch),
    }),
    persistOptions<MusicState>('music'),
  ),
)

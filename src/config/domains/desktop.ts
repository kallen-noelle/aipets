/**
 * 桌面偏好域：音频采集约束。
 *
 * 窗口与托盘状态由主进程管理，这里只放网页也能读取的采集参数。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const desktopPreferencesSchema = z.object({
  echoCancellation: z.boolean(),
  noiseSuppression: z.boolean(),
  autoGainControl: z.boolean(),
})

export type DesktopPreferences = z.infer<typeof desktopPreferencesSchema>

interface DesktopPreferencesState extends DesktopPreferences {
  update: (patch: Partial<DesktopPreferences>) => void
}

export const useDesktopPreferencesStore = create<DesktopPreferencesState>()(
  persist(
    set => ({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      update: patch => set(patch),
    }),
    persistOptions<DesktopPreferencesState>('desktop'),
  ),
)

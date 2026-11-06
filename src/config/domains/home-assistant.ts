/**
 * 家庭助手域：Home Assistant 实例地址与令牌。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const homeAssistantSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string(),
  token: z.string(),
})

export type HomeAssistantConfig = z.infer<typeof homeAssistantSchema>

interface HomeAssistantState extends HomeAssistantConfig {
  update: (patch: Partial<HomeAssistantConfig>) => void
}

export const useHomeAssistantStore = create<HomeAssistantState>()(
  persist(
    set => ({
      enabled: false,
      baseUrl: '',
      token: '',
      update: patch => set(patch),
    }),
    persistOptions<HomeAssistantState>('homeAssistant'),
  ),
)

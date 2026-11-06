/**
 * 工具卡片域：工具调用结果的展示开关。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const toolCardsSchema = z.object({
  enabled: z.boolean(),
  replyCards: z.boolean(),
})

export type ToolCardsConfig = z.infer<typeof toolCardsSchema>

interface ToolCardsState extends ToolCardsConfig {
  update: (patch: Partial<ToolCardsConfig>) => void
}

export const useToolCardsStore = create<ToolCardsState>()(
  persist(
    set => ({
      enabled: true,
      replyCards: true,
      update: patch => set(patch),
    }),
    persistOptions<ToolCardsState>('toolCards'),
  ),
)

/**
 * 搜索域：Tavily 网络搜索工具。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const webSearchSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string(),
})

export type WebSearchConfig = z.infer<typeof webSearchSchema>

interface WebSearchState extends WebSearchConfig {
  update: (patch: Partial<WebSearchConfig>) => void
}

export const useWebSearchStore = create<WebSearchState>()(
  persist(
    set => ({
      enabled: false,
      apiKey: '',
      update: patch => set(patch),
    }),
    persistOptions<WebSearchState>('webSearch'),
  ),
)

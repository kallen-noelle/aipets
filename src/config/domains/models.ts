/**
 * 模型域：可用模型清单与当前选择。
 *
 * 与提供商分开：一个提供商可以对应多个模型，切换模型不动凭据。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const modelsSchema = z.object({
  available: z.array(z.string().min(1)),
  selected: z.string().nullable(),
})

interface ModelsState {
  available: string[]
  selected: string | null
  setAvailable: (models: string[]) => void
  select: (model: string | null) => void
}

export const useModelsStore = create<ModelsState>()(
  persist(
    set => ({
      available: ['gpt-4o-mini', 'gpt-4o'],
      selected: 'gpt-4o-mini',
      setAvailable: models => set(state => ({
        available: models,
        // 选择失效时自动退回第一个可用模型。
        selected: state.selected && models.includes(state.selected)
          ? state.selected
          : models[0] ?? null,
      })),
      select: model => set({ selected: model }),
    }),
    persistOptions<ModelsState>('models'),
  ),
)

/**
 * 好感度域：按角色保存 0 到 100 的长期关系值。
 *
 * 对话 Agent 通过 `update_affinity` 工具写入，导演只读取。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const DEFAULT_AFFINITY = 50

export const affinitySchema = z.object({
  /** 角色 id → 好感度。 */
  values: z.record(z.string(), z.number().min(0).max(100)),
})

export type AffinityConfig = z.infer<typeof affinitySchema>

interface AffinityState extends AffinityConfig {
  /** 调整好感度并返回新值。 */
  apply: (characterId: string, delta: number) => number
  reset: (characterId: string) => void
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export const useAffinityStore = create<AffinityState>()(
  persist(
    set => ({
      values: {},
      apply: (characterId, delta) => {
        let next = DEFAULT_AFFINITY
        set((state) => {
          next = clamp((state.values[characterId] ?? DEFAULT_AFFINITY) + delta)
          return { values: { ...state.values, [characterId]: next } }
        })
        return next
      },
      reset: characterId => set((state) => {
        const values = { ...state.values }
        delete values[characterId]
        return { values }
      }),
    }),
    persistOptions<AffinityState>('affinity'),
  ),
)

/** 当前好感度，没有记录时返回默认值。 */
export function affinityOf(characterId: string): number {
  return useAffinityStore.getState().values[characterId] ?? DEFAULT_AFFINITY
}

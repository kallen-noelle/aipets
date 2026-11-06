/**
 * 环境编排域：按实例保存最近一份有效编排。
 *
 * 生成失败时界面只更新错误字段，旧编排保持不变。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const ambientRecordSchema = z.object({
  instanceId: z.string().min(1),
  characterId: z.string().min(1),
  /** 已校验的编排对象，读取时再次解析。 */
  program: z.unknown(),
  generatedAt: z.number(),
  error: z.string(),
})

export type AmbientRecord = z.infer<typeof ambientRecordSchema>

interface AmbientState {
  records: Record<string, AmbientRecord>
  save: (record: AmbientRecord) => void
  fail: (instanceId: string, error: string) => void
  clear: (instanceId: string) => void
}

export const useAmbientStore = create<AmbientState>()(
  persist(
    set => ({
      records: {},
      save: record => set(state => ({
        records: {
          ...state.records,
          [record.instanceId]: { ...record, error: '' },
        },
      })),
      fail: (instanceId, error) => set((state) => {
        const current = state.records[instanceId]
        if (!current)
          return state

        return {
          records: {
            ...state.records,
            [instanceId]: { ...current, error },
          },
        }
      }),
      clear: instanceId => set((state) => {
        const records = { ...state.records }
        delete records[instanceId]
        return { records }
      }),
    }),
    persistOptions<AmbientState>('ambient'),
  ),
)

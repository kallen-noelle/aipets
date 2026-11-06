/**
 * 连接域：事件中继服务地址与令牌。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const connectionSchema = z.object({
  /** ws 或 wss 地址，空字符串表示未配置。 */
  url: z.string(),
  token: z.string(),
})

export type ConnectionConfig = z.infer<typeof connectionSchema>

interface ConnectionState extends ConnectionConfig {
  update: (patch: Partial<ConnectionConfig>) => void
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    set => ({
      url: '',
      token: '',
      update: patch => set(patch),
    }),
    persistOptions<ConnectionState>('connection'),
  ),
)

/**
 * 对话域：采样参数与上下文策略。
 *
 * 只描述"怎么说话"，不包含模型和凭据。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const chatConfigSchema = z.object({
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  /** 请求是否携带温度。模型不支持时关闭。 */
  temperatureEnabled: z.boolean(),
  /** 请求是否携带 Top P。模型不支持时关闭。 */
  topPEnabled: z.boolean(),
  maxSteps: z.number().int().min(1).max(30),
  /** 消息条数超过该值时触发摘要压缩。 */
  summaryThreshold: z.number().int().min(4).max(200),
})

export type ChatConfig = z.infer<typeof chatConfigSchema>

interface ChatConfigState extends ChatConfig {
  update: (patch: Partial<ChatConfig>) => void
}

export const useChatConfigStore = create<ChatConfigState>()(
  persist(
    set => ({
      temperature: 0.7,
      topP: 1,
      temperatureEnabled: false,
      topPEnabled: false,
      maxSteps: 8,
      summaryThreshold: 24,
      update: patch => set(patch),
    }),
    persistOptions<ChatConfigState>('chat'),
  ),
)

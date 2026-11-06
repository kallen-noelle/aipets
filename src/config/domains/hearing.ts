/**
 * 听觉域：识别方式、语言、转写与改写模型、唤醒词与声纹。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const hearingSchema = z.object({
  /** auto 优先本地，本地不可用时走接口转写。omni 用对话模型转写。 */
  mode: z.enum(['auto', 'local', 'provider', 'omni']),
  language: z.string(),
  transcriberModel: z.string(),
  rephraseProviderId: z.string(),
  rephraseModel: z.string(),
  wakeEnabled: z.boolean(),
  wakeWords: z.array(z.string()),
  voiceprintEnabled: z.boolean(),
})

export type HearingConfig = z.infer<typeof hearingSchema>

interface HearingState extends HearingConfig {
  update: (patch: Partial<HearingConfig>) => void
  addWakeWord: (word: string) => void
  removeWakeWord: (word: string) => void
}

export const useHearingStore = create<HearingState>()(
  persist(
    set => ({
      mode: 'local',
      language: 'zh-CN',
      transcriberModel: 'whisper-1',
      rephraseProviderId: '',
      rephraseModel: '',
      wakeEnabled: false,
      wakeWords: ['你好桌面'],
      voiceprintEnabled: false,
      update: patch => set(patch),
      addWakeWord: word => set(state => ({
        wakeWords: state.wakeWords.includes(word) ? state.wakeWords : [...state.wakeWords, word],
      })),
      removeWakeWord: word => set(state => ({
        wakeWords: state.wakeWords.filter(item => item !== word),
      })),
    }),
    persistOptions<HearingState>('hearing'),
  ),
)

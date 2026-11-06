/**
 * 语音域：朗读与录音相关配置。
 *
 * 只保存偏好，接口地址与凭据跟随提供商。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const speechSchema = z.object({
  ttsEnabled: z.boolean(),
  /** 回复完成后自动朗读。 */
  autoSpeak: z.boolean(),
  /** provider 走兼容接口，local 用系统语音。 */
  engine: z.enum(['provider', 'local']),
  voice: z.string(),
  model: z.string(),
  /** 系统语音的音色标识，空字符串表示自动挑中文音色。 */
  localVoice: z.string(),
  localRate: z.number().min(0.5).max(2),
  localPitch: z.number().min(0.5).max(2),
  inputDeviceId: z.string(),
  outputDeviceId: z.string(),
})

export type SpeechConfig = z.infer<typeof speechSchema>

interface SpeechState extends SpeechConfig {
  update: (patch: Partial<SpeechConfig>) => void
}

export const useSpeechStore = create<SpeechState>()(
  persist(
    set => ({
      ttsEnabled: false,
      autoSpeak: true,
      engine: 'provider',
      voice: 'alloy',
      model: 'tts-1',
      localVoice: '',
      localRate: 1,
      localPitch: 1,
      inputDeviceId: '',
      outputDeviceId: '',
      update: patch => set(patch),
    }),
    persistOptions<SpeechState>('speech'),
  ),
)

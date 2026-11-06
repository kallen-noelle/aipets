/**
 * 语音合成与播放。
 *
 * 两种引擎：兼容接口 `/audio/speech` 与系统自带 `speechSynthesis`。
 * 接口失败或环境不支持时退回系统语音，保证开着朗读就一定有声音。
 */

import axios from 'axios'

import { useModelsStore } from '@/config/domains/models'
import { speechProvider } from '@/config/domains/providers'
import { useSpeechStore } from '@/config/domains/speech'
import { providerCredentials } from '@/config/provider-access'

export class SpeechConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpeechConfigError'
  }
}

/** 当前环境是否有系统语音。桌面外壳与浏览器都有。 */
export function isLocalSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** 系统语音列表。Chromium 首次返回空，需要等 `voiceschanged`。 */
export function listLocalVoices(): SpeechSynthesisVoice[] {
  if (!isLocalSpeechAvailable())
    return []

  return window.speechSynthesis.getVoices()
}

/** 合成语音，返回音频二进制。传 providerId 时用指定提供商试听。 */
export async function synthesize(text: string, providerId?: string): Promise<Blob> {
  const { baseUrl, apiKey } = providerCredentials(providerId ?? speechProvider()?.id)
  const { voice, model } = useSpeechStore.getState()

  const response = await axios.post(
    `${baseUrl}/audio/speech`,
    { model: model || useModelsStore.getState().selected, voice, input: text, response_format: 'mp3' },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      responseType: 'blob',
      timeout: 30_000,
    },
  )

  return response.data as Blob
}

/** 用系统语音朗读，返回停止函数。 */
function speakLocally(text: string): () => void {
  const { localVoice, localRate, localPitch } = useSpeechStore.getState()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = localRate
  utterance.pitch = localPitch

  const voice = localVoice
    ? window.speechSynthesis.getVoices().find(candidate => candidate.voiceURI === localVoice)
    : undefined
  if (voice)
    utterance.voice = voice

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)

  return () => window.speechSynthesis.cancel()
}

/** 接口合成后播放，返回停止函数。 */
async function speakRemotely(text: string): Promise<() => void> {
  const blob = await synthesize(text)
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  const { outputDeviceId } = useSpeechStore.getState()

  // 指定输出设备；浏览器不支持时退回默认设备。
  if (outputDeviceId && 'setSinkId' in audio) {
    try {
      await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
        .setSinkId(outputDeviceId)
    }
    catch {
      // 设备被移除时继续用默认设备播放。
    }
  }

  const cleanup = () => {
    audio.pause()
    URL.revokeObjectURL(url)
  }
  audio.addEventListener('ended', cleanup, { once: true })
  audio.addEventListener('error', cleanup, { once: true })

  await audio.play()

  return cleanup
}

/**
 * 朗读一段文本。
 *
 * 返回停止函数，调用后立即中断。接口失败且系统语音可用时自动改用系统语音。
 */
export async function speak(text: string): Promise<() => void> {
  const { engine } = useSpeechStore.getState()
  if (engine === 'local' && isLocalSpeechAvailable())
    return speakLocally(text)

  try {
    return await speakRemotely(text)
  }
  catch (error) {
    if (isLocalSpeechAvailable())
      return speakLocally(text)
    throw error
  }
}

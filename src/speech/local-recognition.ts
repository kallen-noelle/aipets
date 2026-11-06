/**
 * 浏览器自带的语音识别。
 *
 * Chromium 内核的桌面外壳里通常没有这个实现，此时调用方走接口转写。
 * 有实现时不需要提供商与 Key，适合网页调试版。
 */

import { useHearingStore } from '@/config/domains/hearing'

interface RecognitionAlternative {
  transcript: string
}

interface RecognitionResult {
  isFinal: boolean
  [index: number]: RecognitionAlternative
}

interface RecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: RecognitionResult
  }
}

interface RecognitionErrorEvent {
  error?: string
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type RecognitionConstructor = new () => RecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
}

function getConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined')
    return null

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

/** 当前环境是否支持本地识别。 */
export function isLocalRecognitionAvailable(): boolean {
  return getConstructor() !== null
}

export interface LocalRecognitionHandle {
  /** 停止录音并返回识别出的文字。 */
  stop: () => Promise<string>
  /** 取消并丢弃本次识别。 */
  cancel: () => void
}

/** 启动本地识别。环境不支持时抛错。 */
export function startLocalRecognition(): LocalRecognitionHandle {
  const Constructor = getConstructor()
  if (!Constructor)
    throw new Error('当前环境不支持本地语音识别')

  const recognition = new Constructor()
  recognition.lang = useHearingStore.getState().language || 'zh-CN'
  recognition.continuous = true
  recognition.interimResults = true

  let transcript = ''
  let failure: Error | null = null
  let settled = false
  let finish: (() => void) | null = null

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index]
      if (result.isFinal)
        transcript += result[0].transcript
    }
  }

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted')
      return

    failure = new Error(`本地语音识别失败：${event.error ?? '未知错误'}`)
  }

  recognition.onend = () => {
    if (settled)
      return
    settled = true
    finish?.()
  }

  recognition.start()

  return {
    stop: () => new Promise<string>((resolve, reject) => {
      finish = () => {
        if (failure)
          reject(failure)
        else
          resolve(transcript.trim())
      }
      recognition.stop()
      // 某些内核关掉麦克风后不再触发 onend，这里兜底。
      window.setTimeout(() => {
        if (settled)
          return
        settled = true
        finish?.()
      }, 1500)
    }),
    cancel: () => {
      settled = true
      recognition.abort()
    },
  }
}

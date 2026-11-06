/**
 * 录音与转写。
 *
 * 录音走 MediaRecorder，转写走 OpenAI 兼容的 `/audio/transcriptions`。
 */

import axios from 'axios'
import { HumanMessage, SystemMessage } from 'langchain'

import { useDesktopPreferencesStore } from '@/config/domains/desktop'
import { useHearingStore } from '@/config/domains/hearing'
import { transcriptionProvider } from '@/config/domains/providers'
import { useSpeechStore } from '@/config/domains/speech'
import { providerCredentials } from '@/config/provider-access'
import { createChatModel } from '@/llm/client'

/** 一次录音会话。 */
export class Recorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []

  async start(): Promise<void> {
    const { inputDeviceId } = useSpeechStore.getState()
    const preferences = useDesktopPreferencesStore.getState()
    const audio: MediaTrackConstraints = {
      ...(inputDeviceId ? { deviceId: { exact: inputDeviceId } } : {}),
      echoCancellation: preferences.echoCancellation,
      noiseSuppression: preferences.noiseSuppression,
      autoGainControl: preferences.autoGainControl,
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio })
    this.chunks = []

    this.recorder = new MediaRecorder(this.stream)
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0)
        this.chunks.push(event.data)
    })
    this.recorder.start()
  }

  /** 取消录音，丢弃已录内容。 */
  cancel(): void {
    this.recorder?.stop()
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.recorder = null
    this.chunks = []
  }

  /** 结束录音并返回音频。 */
  async stop(): Promise<Blob> {
    const recorder = this.recorder
    if (!recorder)
      throw new Error('尚未开始录音')

    await new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.stop()
    })

    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.recorder = null

    return new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' })
  }
}

/** 把录音转成文字。 */
export async function transcribe(audio: Blob): Promise<string> {
  const hearing = useHearingStore.getState()
  const { baseUrl, apiKey } = providerCredentials(transcriptionProvider()?.id)

  const form = new FormData()
  form.append('file', audio, 'speech.webm')
  form.append('model', hearing.transcriberModel || 'whisper-1')

  const response = await axios.post<{ text?: string }>(
    `${baseUrl}/audio/transcriptions`,
    form,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 30_000,
    },
  )

  return rephraseTranscript(response.data.text?.trim() ?? '')
}

/**
 * 用对话模型转写录音。
 *
 * omni 模型没有 `/audio/transcriptions` 接口，改为把音频放进聊天消息。
 */
export async function transcribeWithOmni(audio: Blob): Promise<string> {
  const hearing = useHearingStore.getState()
  const { baseUrl, apiKey } = providerCredentials(transcriptionProvider()?.id)
  const model = hearing.transcriberModel.trim() || 'qwen3.8-omni-flash'
  const data = await toWavBase64(audio)

  const response = await axios.post<{
    choices?: Array<{ message?: { content?: string } }>
  }>(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: '你是转写引擎。只输出音频里的文字，不要解释。' },
        {
          role: 'user',
          content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${data}` } }],
        },
      ],
      stream: false,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 30_000,
    },
  )

  const text = response.data.choices?.[0]?.message?.content?.trim() ?? ''
  return rephraseTranscript(text)
}

/** 按改写模型整理转写文本。未配置模型或调用失败时原样返回。 */
async function rephraseTranscript(text: string): Promise<string> {
  const { rephraseModel, rephraseProviderId } = useHearingStore.getState()
  if (!text || !rephraseModel.trim())
    return text

  try {
    const model = createChatModel({
      model: rephraseModel,
      providerId: rephraseProviderId || undefined,
    })
    const reply = await model.invoke([
      new SystemMessage('你负责整理语音转写。只输出整理后的文字，不要解释。'),
      new HumanMessage(text),
    ])
    return typeof reply.content === 'string' && reply.content.trim()
      ? reply.content.trim()
      : text
  }
  catch (error) {
    // 改写失败时保留原始转写，避免整段语音输入丢失。
    console.warn('[aipets] 转写改写失败', error)
    return text
  }
}

/** 把录音解码成单声道 WAV 的 base64。 */
async function toWavBase64(blob: Blob): Promise<string> {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    return bytesToBase64(encodeWav(buffer.getChannelData(0), buffer.sampleRate))
  }
  finally {
    await context.close()
  }
}

/** 编码 16 位单声道 PCM WAV。 */
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)

  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++)
      view.setUint8(offset + index, text.charCodeAt(index))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    // 负值取满量程，正值少一位，避免溢出。
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true)
    offset += 2
  }

  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)

  return btoa(binary)
}

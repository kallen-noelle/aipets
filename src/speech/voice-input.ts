/**
 * 语音输入：按配置在本地识别与接口转写之间选择。
 *
 * 界面只调用 `start` / `stop` / `cancel`，不关心底层引擎。
 */

import { useHearingStore } from '@/config/domains/hearing'

import { Recorder, transcribe, transcribeWithOmni } from './asr'
import { isLocalRecognitionAvailable, startLocalRecognition, type LocalRecognitionHandle } from './local-recognition'

export type VoiceInputMode = 'provider' | 'local' | 'omni'

export class VoiceInput {
  private recorder: Recorder | null = null
  private local: LocalRecognitionHandle | null = null
  private mode: VoiceInputMode = 'provider'

  /** 开始采集，返回实际使用的引擎。 */
  async start(): Promise<VoiceInputMode> {
    const { mode } = useHearingStore.getState()
    const preferLocal = mode === 'local'
      || (mode === 'auto' && isLocalRecognitionAvailable())

    if (preferLocal) {
      this.local = startLocalRecognition()
      this.mode = 'local'
      return this.mode
    }

    const recorder = new Recorder()
    try {
      await recorder.start()
    }
    catch (error) {
      // 自动模式下接口引擎不可用时，再试一次本地识别。
      if (mode === 'auto' && isLocalRecognitionAvailable()) {
        this.local = startLocalRecognition()
        this.mode = 'local'
        return this.mode
      }
      throw error
    }

    this.recorder = recorder
    this.mode = mode === 'omni' ? 'omni' : 'provider'
    return this.mode
  }

  /** 结束采集并返回文字。 */
  async stop(): Promise<string> {
    if (this.local) {
      const handle = this.local
      this.local = null
      return handle.stop()
    }

    const recorder = this.recorder
    if (!recorder)
      return ''

    this.recorder = null
    const audio = await recorder.stop()
    return this.mode === 'omni'
      ? transcribeWithOmni(audio)
      : transcribe(audio)
  }

  /** 放弃本次采集。 */
  cancel(): void {
    this.local?.cancel()
    this.local = null
    this.recorder?.cancel()
    this.recorder = null
  }
}

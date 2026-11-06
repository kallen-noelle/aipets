/**
 * 麦克风监测：打开输入设备，输出音量与是否正在说话。
 *
 * 只用于设置页的实时预览，不参与转写链路。转写由 `speech/` 负责。
 */

export interface MicrophoneOptions {
  deviceId?: string
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
}

export interface VoiceActivityState {
  /** 归一化音量，0 到 1。 */
  level: number
  speaking: boolean
}

/** 说话判定阈值，超过即视为说话。 */
const SPEAKING_THRESHOLD = 0.06

export class MicrophoneMonitor {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private samples: Float32Array<ArrayBuffer> | null = null
  private timer: number | null = null
  private listeners = new Set<(state: VoiceActivityState) => void>()

  get active(): boolean {
    return this.timer !== null
  }

  /** 打开设备并开始采样。重复调用会先关闭上一次的会话。 */
  async start(options: MicrophoneOptions): Promise<void> {
    this.stop()

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        echoCancellation: options.echoCancellation,
        noiseSuppression: options.noiseSuppression,
        autoGainControl: options.autoGainControl,
      },
    })

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    await context.resume()

    this.stream = stream
    this.context = context
    this.analyser = analyser
    this.samples = new Float32Array(analyser.fftSize)
    this.timer = window.setInterval(() => this.sample(), 120)
  }

  /** 关闭设备与分析上下文。 */
  stop(): void {
    if (this.timer !== null)
      window.clearInterval(this.timer)
    this.timer = null

    this.stream?.getTracks().forEach(track => track.stop())
    void this.context?.close()

    this.stream = null
    this.context = null
    this.analyser = null
    this.samples = null
    this.emit({ level: 0, speaking: false })
  }

  subscribe(listener: (state: VoiceActivityState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private sample(): void {
    const analyser = this.analyser
    const samples = this.samples
    if (!analyser || !samples)
      return

    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const value of samples)
      sum += value * value

    // 放大均方根值，界面上的音量条更容易看出变化。
    const level = Math.min(1, Math.sqrt(sum / samples.length) * 8)
    this.emit({ level, speaking: level >= SPEAKING_THRESHOLD })
  }

  private emit(state: VoiceActivityState): void {
    for (const listener of this.listeners)
      listener(state)
  }
}

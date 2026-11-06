/**
 * 麦克风节拍检测。
 *
 * 用能量阈值判断节拍，统计最近间隔算 BPM。参数来自 beatSync 域。
 */

import { useBeatSyncStore } from '@/config/domains/beat-sync'

export interface BeatHandlers {
  onBeat: (beats: number) => void
  onBpm: (bpm: number) => void
}

export class BeatDetector {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private audio: HTMLAudioElement | null = null
  private audioUrl: string | null = null
  private frame = 0
  private running = false
  private startedAt = 0
  private lastBeatAt = 0
  private beats = 0
  private intervals: number[] = []
  private envelope = 0
  private history: number[] = []

  /**
   * 开始检测。
   *
   * 传 `file` 时循环播放该音频并分析其波形；不传则用麦克风。
   */
  async start(handlers: BeatHandlers, file?: File): Promise<void> {
    const { bufferDurationMs } = useBeatSyncStore.getState()
    const context = new AudioContext()

    let source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode
    if (file) {
      const url = URL.createObjectURL(file)
      const audio = new Audio(url)
      audio.loop = true
      this.audio = audio
      this.audioUrl = url
      source = context.createMediaElementSource(audio)
    }
    else {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.stream = stream
      source = context.createMediaStreamSource(stream)
    }

    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)

    this.context = context
    this.analyser = analyser
    this.running = true
    this.startedAt = performance.now()
    this.lastBeatAt = 0
    this.beats = 0
    this.intervals = []
    this.envelope = 0
    this.history = []

    if (file)
      await this.audio?.play()

    const data = new Uint8Array(analyser.fftSize)
    const frameMs = 16
    const historySize = Math.max(8, Math.round(bufferDurationMs / frameMs))

    const tick = () => {
      if (!this.running || !this.analyser)
        return

      this.analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const value of data) {
        const sample = (value - 128) / 128
        sum += sample * sample
      }
      const rms = Math.sqrt(sum / data.length)

      const config = useBeatSyncStore.getState()
      const smoothing = Math.max(0.05, Math.min(1, frameMs / Math.max(1, config.envelopeMs)))
      this.envelope = this.envelope * (1 - smoothing) + rms * smoothing

      this.history.push(this.envelope)
      if (this.history.length > historySize)
        this.history.shift()

      const average = this.history.reduce((total, value) => total + value, 0) / this.history.length
      const threshold = config.adaptiveThreshold
        ? average * (1.15 + config.sensitivity)
        : config.sensitivity

      const now = performance.now()
      const warmed = now - this.startedAt >= config.warmupMs
      if (warmed && this.envelope > threshold && now - this.lastBeatAt >= config.minBeatIntervalMs) {
        const interval = this.lastBeatAt > 0 ? now - this.lastBeatAt : 0
        this.lastBeatAt = now
        this.beats += 1

        if (interval > 0) {
          this.intervals.push(interval)
          if (this.intervals.length > 8)
            this.intervals.shift()
          const sorted = [...this.intervals].sort((left, right) => left - right)
          const median = sorted[Math.floor(sorted.length / 2)]
          if (median > 0)
            handlers.onBpm(Math.round(60_000 / median))
        }

        handlers.onBeat(this.beats)
      }

      this.frame = requestAnimationFrame(tick)
    }

    this.frame = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frame)
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.audio?.pause()
    this.audio = null
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl)
      this.audioUrl = null
    }
    void this.context?.close()
    this.context = null
    this.analyser = null
  }
}

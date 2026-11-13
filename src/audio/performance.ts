/**
 * 表演音频管线：弹琴与唱歌共用一套合成、调度与打断逻辑。
 *
 * 只用 Web Audio 合成，不加载采样包。全局只有一个播放器，开始新表演时
 * 会先停掉上一段，保证声音不会叠在一起；琴键高亮与歌词字幕通过
 * `usePlaybackStore` 推给界面。
 */

import { useMusicStore } from '@/config/domains/music'

import { usePlaybackStore, type PlaybackMode } from './playback-store'
import { beatSeconds, pitchToFrequency, pitchToKeyId, type Score } from './score'

type Timbre = 'piano' | 'voice'

let context: AudioContext | null = null
/** 当前表演的停止函数；为空表示没有在演奏。 */
let stopCurrent: (() => void) | null = null

/** 延迟创建的 AudioContext；环境不支持时返回 null。 */
function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined')
    return null

  const AudioContextClass = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass)
    return null

  context ??= new AudioContextClass()
  // 自动播放策略下上下文可能处于挂起状态，演奏前尝试恢复。
  if (context.state === 'suspended')
    void context.resume()

  return context
}

/** 安排一个音符：钢琴用三角波短促衰减，人声用带颤音的正弦波。 */
function scheduleNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  duration: number,
  timbre: Timbre,
): void {
  const gain = ctx.createGain()
  gain.connect(destination)

  const oscillator = ctx.createOscillator()
  oscillator.type = timbre === 'piano' ? 'triangle' : 'sine'
  oscillator.frequency.value = frequency
  oscillator.connect(gain)

  // 起音短、收尾平滑，避免爆音。
  const attack = Math.min(0.02, duration / 4)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(timbre === 'piano' ? 0.28 : 0.22, startAt + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

  // 颤音让“唱”与“弹”的音色区分开。
  let vibrato: OscillatorNode | null = null
  if (timbre === 'voice') {
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = 5.5
    depth.gain.value = 6
    lfo.connect(depth)
    depth.connect(oscillator.detune)
    lfo.start(startAt)
    lfo.stop(startAt + duration)
    vibrato = lfo
  }

  oscillator.start(startAt)
  oscillator.stop(startAt + duration)

  const cleanup = () => {
    oscillator.disconnect()
    gain.disconnect()
    vibrato?.disconnect()
  }
  oscillator.addEventListener('ended', cleanup, { once: true })
}

function stopAll(): void {
  stopCurrent?.()
  stopCurrent = null
  usePlaybackStore.getState().finish()
}

/**
 * 演奏一首曲子。
 *
 * 参数 `mode` 决定音色与界面形态：钢琴显示琴键，唱歌同时显示歌词。
 * 返回 false 表示当前环境拿不到 AudioContext。
 */
export function playScore(score: Score, mode: PlaybackMode): boolean {
  const ctx = ensureContext()
  if (!ctx)
    return false

  stopAll()

  const volume = useMusicStore.getState().volume
  const master = ctx.createGain()
  master.gain.value = Math.min(1, Math.max(0, volume))
  master.connect(ctx.destination)

  const store = usePlaybackStore.getState()
  store.begin(mode, score.title)

  const timbre: Timbre = mode === 'piano' ? 'piano' : 'voice'
  const beat = beatSeconds(score.bpm)
  const startAt = ctx.currentTime + 0.08
  const timers: number[] = []

  let cursor = startAt
  for (let index = 0; index < score.notes.length; index++) {
    const note = score.notes[index]
    const frequency = pitchToFrequency(note.pitch)
    const duration = Math.max(0.08, note.beats * beat)
    if (frequency)
      scheduleNote(ctx, master, frequency, cursor, duration * 0.95, timbre)

    // 界面高亮与音频用同一时间轴，延迟到音符开始时更新。
    const delay = (cursor - ctx.currentTime) * 1000
    const keyId = pitchToKeyId(note.pitch)
    const lyric = mode === 'sing' ? lyricAt(score, index) : null
    timers.push(window.setTimeout(() => {
      usePlaybackStore.getState().highlight(keyId, lyric)
    }, Math.max(0, delay)))

    cursor += duration
  }

  const total = (cursor - ctx.currentTime) * 1000
  timers.push(window.setTimeout(() => {
    stopCurrent = null
    usePlaybackStore.getState().finish()
  }, Math.max(0, total)))

  stopCurrent = () => {
    for (const timer of timers)
      window.clearTimeout(timer)
    master.disconnect()
    usePlaybackStore.getState().finish()
  }

  return true
}

/** 找出第 index 个音符时应该显示的歌词行。 */
function lyricAt(score: Score, index: number): string | null {
  const lines = score.lyrics ?? []
  let text: string | null = null
  for (const line of lines) {
    if (line.at > index)
      break
    text = line.text
  }

  return text
}

/** 立即停止当前表演，并清空界面高亮。 */
export function stopPerformance(): void {
  stopAll()
}

/** 当前是否正在演奏。 */
export function isPerforming(): boolean {
  return stopCurrent !== null
}

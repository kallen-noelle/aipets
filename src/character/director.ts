/**
 * 导演：把状态机、选择器、播放器串成一个持续循环。
 *
 * 循环模型很简单：每一轮按当前状态挑一个片段播，播完或被打断后进入下一轮。
 * 状态变化会打断播放，循环随即用新状态重选片段，所以不需要额外的调度代码。
 *
 * 空闲时按间隔轮换待机片段，并偶尔插入情绪或长动作。
 */

import type { AmbientProgram } from './ambient'
import { AmbientRunner } from './ambient-runner'
import { clipUrl, clipsForPool, clipsForState } from './catalog'
import { ClipRunner } from './clip-runner'
import { EmotionTracker, matchesEmotion } from './emotion'
import type { CharacterVideoPlayer } from './player'
import {
  clipDisplayName,
  DEFAULT_LONG_HOLD_MS,
  isLongAction,
  resolvePerformClip,
  type PerformanceStep,
} from './perform'
import { ClipSelector } from './selector'
import { CharacterStateMachine, type CharacterEvent } from './state-machine'
import type { CharacterClip, CharacterDefinition, CharacterStateName } from './types'

export interface DirectorOptions {
  character: CharacterDefinition
  player: CharacterVideoPlayer
  random?: () => number
  /** 待机片段轮换间隔范围，毫秒。 */
  idleIntervalMs?: [number, number]
  /** 空闲时插入情绪或长动作的概率。 */
  poolChance?: number
  emotionDurationMs?: number
}

export class CharacterDirector {
  private readonly character: CharacterDefinition
  private readonly runner: ClipRunner
  private readonly machine = new CharacterStateMachine()
  private readonly stateSelector: ClipSelector
  private readonly poolSelector: ClipSelector
  private readonly emotion: EmotionTracker
  private readonly random: () => number
  private readonly idleIntervalMs: [number, number]
  private readonly poolChance: number
  private readonly ambient: AmbientRunner
  private ambientProgram: AmbientProgram | null = null
  private performing = false
  private onPerformEnd: (() => void) | null = null
  private performanceToken = 0
  private readonly recent: string[] = []
  private disposed = false
  private failures = 0

  constructor(options: DirectorOptions) {
    this.character = options.character
    this.random = options.random ?? Math.random
    // 片段里存的是资源内的相对路径，播放前统一拼成当前环境的基地址。
    this.runner = new ClipRunner(options.player, src => clipUrl(this.character.id, src))
    this.stateSelector = new ClipSelector(this.random)
    this.poolSelector = new ClipSelector(this.random)
    this.emotion = new EmotionTracker({
      durationMs: options.emotionDurationMs,
      random: this.random,
    })
    this.idleIntervalMs = options.idleIntervalMs ?? [8000, 16000]
    this.poolChance = options.poolChance ?? 0.25
    this.ambient = new AmbientRunner(
      this.character,
      options.player,
      this.runner,
      name => this.remember(name),
    )
  }

  /** 最近播放的片段名，最新的在前。 */
  recentClips(): string[] {
    return [...this.recent]
  }

  /** 顺序播放一组表演步骤，播放期间暂停规则循环。 */
  perform(steps: PerformanceStep[]): void {
    if (this.disposed || steps.length === 0)
      return

    this.stopAmbient()
    const token = ++this.performanceToken
    this.performing = true
    this.runner.stop()

    void (async () => {
      for (const step of steps) {
        if (this.disposed || token !== this.performanceToken)
          return

        const clip = resolvePerformClip(this.character, step.name)
        if (!clip)
          continue

        this.remember(step.name)
        if (isLongAction(clip))
          await this.runner.runLongAction(clip, step.durationMs ?? DEFAULT_LONG_HOLD_MS)
        else
          await this.runner.run({ ...clip, loop: false })
      }

      if (token === this.performanceToken) {
        this.performing = false
        this.onPerformEnd?.()
      }
    })()
  }

  /** 顺序表演结束时通知外部，用来接上延迟的环境编排。 */
  setPerformEndListener(listener: (() => void) | null): void {
    this.onPerformEnd = listener
  }

  /** 顺序表演是否正在播放。 */
  get performingActive(): boolean {
    return this.performing
  }

  /** 取消顺序表演。 */
  cancelPerform(): void {
    this.performanceToken++
    this.performing = false
    this.runner.stop()
  }

  /** 进入环境编排，可从指定动作与剩余时长恢复。 */
  startAmbient(
    program: AmbientProgram,
    options?: { clipIndex?: number, holdMs?: number },
  ): void {
    if (this.disposed)
      return

    this.ambientProgram = program
    this.ambient.start(program, options)
  }

  /** 环境编排是否正在运行或暂停等待点击反应结束。 */
  get ambientActive(): boolean {
    return this.ambient.active || this.ambient.paused
  }

  /** 临时监控：当前环境编排动作，未运行时为 null。 */
  get ambientClipIndex(): number | null {
    return this.ambient.active || this.ambient.paused ? this.ambient.currentClip : null
  }

  /** 临时监控：环境编排是否处于点击/拖拽后的暂停。 */
  get ambientPaused(): boolean {
    return this.ambient.paused
  }

  /** 退出环境编排，回到规则循环。 */
  stopAmbient(): void {
    this.ambientProgram = null
    this.ambient.stop()
  }

  get state(): CharacterStateName {
    return this.machine.state
  }

  /** 启动循环，立即播放待机片段。 */
  start(): void {
    if (this.disposed)
      return

    void this.loop()
  }

  /** 订阅状态变化，UI 可据此显示文字或指示。 */
  subscribe(listener: (state: CharacterStateName) => void): () => void {
    return this.machine.subscribe(listener)
  }

  /**
   * 下发外部事件。
   *
   * 返回 true 表示状态确实变了；导演循环会被打断并换到新状态。
   */
  dispatch(event: CharacterEvent): boolean {
    if (this.disposed)
      return false

    // 顺序表演期间只允许新回合取消，点击与拖拽不打断。
    if (this.performing)
      return false

    // 环境编排中点击或拖拽时暂停保持，反应结束后再恢复。
    if (this.ambient.active && (event.type === 'petted' || event.type === 'drag-started'))
      this.ambient.pause()

    this.reactToEmotion(event)
    const changed = this.machine.dispatch(event)
    if (changed)
      this.runner.stop()

    return changed
  }

  destroy(): void {
    this.disposed = true
    this.ambient.stop()
    this.runner.stop()
  }

  private remember(name: string): void {
    this.recent.unshift(name)
    if (this.recent.length > 5)
      this.recent.length = 5
  }

  private reactToEmotion(event: CharacterEvent): void {
    switch (event.type) {
      case 'petted':
        this.emotion.petted()
        break
      case 'drag-started':
        this.emotion.dragged()
        break
      case 'speech-started':
        this.emotion.calm()
        break
      default:
        break
    }
  }

  private async loop(): Promise<void> {
    while (!this.disposed) {
      // 顺序表演与环境编排接管时，规则循环只等待。
      if (this.performing || this.ambient.active) {
        await this.sleep(150)
        continue
      }

      // 点击或拖拽反应结束后，回到环境编排的保持段。
      if (this.ambient.paused && this.ambientProgram && this.machine.state === 'idle') {
        this.ambient.resume()
        continue
      }

      const state = this.machine.state
      const clip = this.stateSelector.pick(clipsForState(this.character, state))
      if (!clip) {
        await this.sleep(1000)
        continue
      }

      this.remember(clipDisplayName(clip))

      // 待机片段是循环的，靠定时打断来轮换。
      let interrupted = false
      const rotator = state === 'idle'
        ? window.setTimeout(() => {
            interrupted = true
            this.runner.stop()
          }, this.idleDelay())
        : null

      const played = await this.runner.run(clip, () => {
        if (state === 'petted')
          this.machine.finishTransient()
      })
      if (rotator !== null)
        window.clearTimeout(rotator)

      if (this.disposed)
        return

      if (!played && !interrupted) {
        await this.backoff()
        continue
      }
      this.failures = 0

      // 一次性动作播完就回待机。
      if (state === 'petted')
        this.machine.finishTransient()

      if (state !== 'idle')
        continue

      // 长时间待机：偶尔插入情绪或长动作，再进入犯困。
      const pool = this.pickPoolClip()
      if (pool) {
        await this.runner.run(pool)
        continue
      }

      this.emotion.bored()
    }
  }

  /** 连续失败时退避，避免不可播放的片段空转。 */
  private async backoff(): Promise<void> {
    this.failures++
    if (this.failures >= 3) {
      this.stateSelector.reset()
      this.poolSelector.reset()
      this.failures = 0
      await this.sleep(1500)
      return
    }

    await this.sleep(300)
  }

  private pickPoolClip(): CharacterClip | null {
    const mood = this.emotion.get()
    if (mood !== 'neutral') {
      const preferred = clipsForPool(this.character, 'emotion')
        .filter(clip => matchesEmotion(clip, mood))
      if (preferred.length > 0)
        return this.poolSelector.pick(preferred)
    }

    if (this.random() >= this.poolChance)
      return null

    const pool = this.random() < 0.6 ? 'emotion' : 'actions'
    return this.poolSelector.pick(clipsForPool(this.character, pool))
  }

  private idleDelay(): number {
    const [min, max] = this.idleIntervalMs
    return min + this.random() * (max - min)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms)
    })
  }
}

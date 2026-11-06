/**
 * 环境编排执行器：按模型给出的动作顺序播放。
 *
 * 短片播放一次；长动作 start → loop 循环到 durationMs → 等当前 loop 播完 → end。
 * 序列播完回到第一个动作。支持暂停与恢复：记录当前动作与剩余保持时间。
 */

import type { AmbientProgram } from './ambient'
import type { ClipRunner } from './clip-runner'
import type { CharacterVideoPlayer } from './player'
import { DEFAULT_LONG_HOLD_MS, isLongAction, resolvePerformClip } from './perform'
import type { CharacterDefinition } from './types'

interface ResumePoint {
  clipIndex: number
  holdMs?: number
}

export class AmbientRunner {
  private readonly character: CharacterDefinition
  private readonly player: CharacterVideoPlayer
  private readonly runner: ClipRunner
  private readonly onClip: (name: string) => void
  private token = 0
  private program: AmbientProgram | null = null
  private clipIndex = 0
  private activeValue = false
  private pausedValue = false
  private resumePoint: ResumePoint | null = null
  private holdEndsAt = 0

  constructor(
    character: CharacterDefinition,
    player: CharacterVideoPlayer,
    runner: ClipRunner,
    onClip: (name: string) => void,
  ) {
    this.character = character
    this.player = player
    this.runner = runner
    this.onClip = onClip
  }

  get active(): boolean {
    return this.activeValue
  }

  get paused(): boolean {
    return this.pausedValue
  }

  get currentClip(): number {
    return this.clipIndex
  }

  /** 从头或从某个动作开始执行。 */
  start(program: AmbientProgram, options: { clipIndex?: number, holdMs?: number } = {}): void {
    this.token++
    this.runner.stop()
    this.program = program
    this.clipIndex = options.clipIndex ?? 0
    this.activeValue = true
    this.pausedValue = false
    this.resumePoint = null
    this.holdEndsAt = 0
    void this.loop(this.token, options.holdMs)
  }

  /** 暂停当前动作，记录剩余保持时间。 */
  pause(): void {
    if (!this.activeValue || !this.program)
      return

    const item = this.program.clips[this.clipIndex]
    const clip = item ? resolvePerformClip(this.character, item.name) : null
    const holdMs = clip && isLongAction(clip)
      ? (this.holdEndsAt > 0
          ? Math.max(0, this.holdEndsAt - Date.now())
          : (item?.durationMs ?? DEFAULT_LONG_HOLD_MS))
      : undefined

    this.resumePoint = {
      clipIndex: this.clipIndex,
      ...(holdMs !== undefined ? { holdMs } : {}),
    }
    this.token++
    this.runner.stop()
    this.player.stop()
    this.activeValue = false
    this.pausedValue = true
  }

  /** 从暂停位置恢复。 */
  resume(): void {
    if (!this.pausedValue || !this.program || !this.resumePoint)
      return

    const point = this.resumePoint
    this.resumePoint = null
    this.pausedValue = false
    this.start(this.program, point)
  }

  /** 完全停止并清空编排。 */
  stop(): void {
    this.token++
    this.runner.stop()
    this.player.stop()
    this.program = null
    this.clipIndex = 0
    this.activeValue = false
    this.pausedValue = false
    this.resumePoint = null
    this.holdEndsAt = 0
  }

  private async loop(token: number, initialHoldMs?: number): Promise<void> {
    let holdMs = initialHoldMs

    try {
      while (token === this.token && this.program) {
        const item = this.program.clips[this.clipIndex]
        if (!item) {
          this.clipIndex = 0
          continue
        }

        const clip = resolvePerformClip(this.character, item.name)
        if (!clip) {
          this.advance()
          continue
        }

        this.holdEndsAt = 0

        if (isLongAction(clip)) {
          const duration = holdMs ?? item.durationMs ?? DEFAULT_LONG_HOLD_MS
          holdMs = undefined
          this.onClip(item.name)
          this.holdEndsAt = Date.now() + duration

          const completed = await this.runner.runLongAction(clip, duration)
          if (token !== this.token)
            return

          this.advance()
          if (!completed)
            continue
        }
        else {
          holdMs = undefined
          this.onClip(item.name)
          await this.runner.run({ ...clip, loop: false })
          if (token !== this.token)
            return

          this.advance()
        }
      }
    }
    finally {
      // 播放失败但没有被暂停或停止时，释放规则循环。
      if (token === this.token)
        this.activeValue = false
    }
  }

  private advance(): void {
    if (!this.program?.clips.length)
      return
    this.clipIndex = (this.clipIndex + 1) % this.program.clips.length
  }
}

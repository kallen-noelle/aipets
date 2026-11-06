/**
 * 片段运行器：把一个片段（可能是多段演出）完整播完。
 *
 * `CharacterVideoPlayer` 只管双 video 交叉淡入；这里负责序列编排、循环与
 * 播完回调，导演据此知道何时换动作。
 */

import type { CharacterVideoPlayer } from './player'
import type { CharacterClip } from './types'

/** 等待单段视频播完，token 失效时返回 false。 */
function waitForClipEnd(video: HTMLVideoElement, isStale: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (value: boolean) => {
      video.removeEventListener('ended', onEnded)
      window.clearInterval(watcher)
      resolve(value)
    }
    const onEnded = () => finish(true)
    // ended 不会在被打断时触发，用轮询兜住，避免 promise 永久挂起。
    const watcher = window.setInterval(() => {
      if (isStale())
        finish(false)
    }, 200)

    video.addEventListener('ended', onEnded)
    if (video.ended)
      finish(true)
  })
}

export class ClipRunner {
  private readonly player: CharacterVideoPlayer
  private readonly resolveSrc: (src: string) => string
  private token = 0

  constructor(player: CharacterVideoPlayer, resolveSrc: (src: string) => string = src => src) {
    this.player = player
    this.resolveSrc = resolveSrc
  }

  /**
   * 播放长动作：start → loop 循环到时长 → 等当前一轮 loop 播完 → end。
   *
   * 时长从 start 第一帧开始计算，start 的播放时间算在时长里；end 不计时，
   * 不管多长都完整播完。时间到点时不会切断正在播放的这一轮 loop，先让它
   * 播完再进 end，优先保证片段逻辑完整。
   */
  async runLongAction(clip: CharacterClip, holdMs: number): Promise<boolean> {
    const token = ++this.token
    const segments = clip.segments.map(this.resolveSrc)
    if (segments.length !== 3)
      return false

    const [start, loop, end] = segments
    const deadline = Date.now() + Math.max(0, holdMs)

    // 起手片段完整播完；失败也继续尝试 loop，避免整段卡死。
    if (!await this.playSegment(start, token) && token !== this.token)
      return false

    if (token !== this.token)
      return false

    // 时长在 start 阶段就用完时直接收尾，与 start 不存在的边界一致。
    if (Date.now() < deadline) {
      const played = await this.player.play(loop, { loop: true })
      if (!played && token !== this.token)
        return false

      if (played) {
        const reached = await this.waitUntil(deadline, token)
        if (!reached)
          return false

        // 到点后关掉循环，让当前这一轮 loop 自然播完。
        this.player.getActiveVideo().loop = false
        const ended = await waitForClipEnd(
          this.player.getActiveVideo(),
          () => token !== this.token,
        )
        if (!ended)
          return false
      }
    }

    if (token !== this.token)
      return false

    await this.playSegment(end, token)
    return token === this.token
  }

  /**
   * 播放一个片段。
   *
   * 返回 false 表示片段不可播放或被打断，调用方应跳过它。
   */
  async run(clip: CharacterClip, onComplete?: () => void): Promise<boolean> {
    const token = ++this.token
    const segments = clip.segments.map(this.resolveSrc)
    if (segments.length === 0)
      return false

    const single = segments.length === 1
    let index = 0

    while (token === this.token) {
      const played = await this.player.play(segments[index], {
        // 单段循环交给 video 自己；多段整组循环由循环体负责。
        loop: clip.loop && single,
      })
      if (!played)
        return false

      const ended = await waitForClipEnd(
        this.player.getActiveVideo(),
        () => token !== this.token,
      )
      if (!ended)
        return false

      index++
      if (index >= segments.length) {
        if (clip.loop) {
          index = 0
          continue
        }

        onComplete?.()
        return true
      }
    }

    return false
  }

  /** 在当前 token 下播放单段并等它播完。 */
  private async playSegment(src: string, token: number): Promise<boolean> {
    const played = await this.player.play(src, { loop: false })
    if (!played)
      return false

    return waitForClipEnd(this.player.getActiveVideo(), () => token !== this.token)
  }

  /** 等待保持时长耗尽；被打断时返回 false。 */
  private waitUntil(deadline: number, token: number): Promise<boolean> {
    if (deadline <= Date.now())
      return Promise.resolve(true)

    return new Promise((resolve) => {
      const tick = () => {
        if (token !== this.token)
          return resolve(false)
        if (Date.now() >= deadline)
          return resolve(true)

        window.setTimeout(tick, Math.min(250, Math.max(1, deadline - Date.now())))
      }

      window.setTimeout(tick, Math.min(250, Math.max(1, deadline - Date.now())))
    })
  }

  /** 打断当前片段，后续的结束回调不再触发。 */
  stop(): void {
    this.token++
  }
}

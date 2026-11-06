/**
 * 双 video 交叉淡入播放器。
 *
 * 两个 video 元素叠放，新片段在隐藏层预加载，可以播放时切到前台并淡入，
 * 旧的淡出后暂停。这样切换时画面始终有内容，不会出现黑屏闪烁。
 *
 * 纯 TS 类，不依赖 React，Vitest 可直接测。
 */

/** 单次播放请求的参数。 */
export interface PlayClipOptions {
  loop?: boolean
}

/** canplay 等待的超时，超时按解码失败处理。 */
const LOAD_TIMEOUT_MS = 10_000

export class CharacterVideoPlayer {
  private readonly fadeMs: number
  private readonly crossOrigin: boolean
  private readonly layers: [HTMLVideoElement, HTMLVideoElement]
  /** 前台层下标。 */
  private activeIndex = 0
  /** 播放请求序号，过期的请求（切换太快）不再上台。 */
  private token = 0
  private disposed = false

  constructor(container: HTMLElement, fadeMs = 180, crossOrigin = false) {
    this.fadeMs = fadeMs
    this.crossOrigin = crossOrigin

    this.layers = [this.createLayer(), this.createLayer()]
    for (const layer of this.layers)
      container.appendChild(layer)
  }

  /**
   * 播放一个片段。
   *
   * 加载失败（解码失败或超时）时返回 false，调用方跳过该片段并保持当前
   * 画面，这就是黑屏风险的兜底。
   */
  async play(url: string, { loop = true }: PlayClipOptions = {}): Promise<boolean> {
    const token = ++this.token
    const next = this.layers[1 - this.activeIndex]
    const current = this.layers[this.activeIndex]

    next.loop = loop
    next.src = url

    try {
      await this.waitForPlayable(next)
    }
    catch (error) {
      // 解码失败或超时要留下原因，静默黑屏最难排查。
      console.warn('[aipets] 片段不可播放，已跳过', url, error)
      // 失败的层要清干净，否则它带着坏 src 干扰下一次加载。
      if (token === this.token) {
        next.pause()
        next.removeAttribute('src')
      }
      return false
    }

    // 等待期间有更新的播放请求，这次放弃上台。
    if (this.disposed || token !== this.token)
      return false

    next.currentTime = 0
    // 播放被拒绝时不要切前台，否则会留下冻结画面。
    const started = await next.play().then(() => true).catch((error: unknown) => {
      console.warn('[aipets] 片段播放被拒绝', url, error)
      return false
    })
    if (!started) {
      if (token === this.token) {
        next.pause()
        next.removeAttribute('src')
      }
      return false
    }

    // 交叉淡入：两层都带 opacity 过渡，切换瞬间旧画面还在。
    next.style.opacity = '1'
    current.style.opacity = '0'
    this.activeIndex = 1 - this.activeIndex

    // 淡出结束后释放旧的解码器。
    window.setTimeout(() => {
      if (this.disposed)
        return
      current.pause()
      current.removeAttribute('src')
    }, this.fadeMs + 50)

    return true
  }

  /** 当前在台前的视频节点，轮廓采样用它。 */
  getActiveVideo(): HTMLVideoElement {
    return this.layers[this.activeIndex]
  }

  /** 临时监控：两层视频的加载与播放状态。 */
  debugVideos(): {
    active: boolean
    src: string
    paused: boolean
    loop: boolean
    currentTime: number | null
    duration: number | null
    error: string | null
  }[] {
    return this.layers.map((video, index) => ({
      active: index === this.activeIndex,
      src: video.currentSrc || video.src,
      paused: video.paused,
      loop: video.loop,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      error: video.error ? `${video.error.code}: ${video.error.message}` : null,
    }))
  }

  /** 停止播放并清空两层。 */
  stop(): void {
    this.token++
    for (const layer of this.layers) {
      layer.pause()
      layer.removeAttribute('src')
      layer.style.opacity = '0'
    }
  }

  destroy(): void {
    this.disposed = true
    this.token++
    for (const layer of this.layers) {
      layer.pause()
      layer.remove()
    }
  }

  private createLayer(): HTMLVideoElement {
    const video = document.createElement('video')
    video.muted = true
    video.autoplay = false
    video.playsInline = true
    video.preload = 'auto'
    // 桌面端资源走自定义协议，属于跨源；开启后画布才能读像素算轮廓。
    // 浏览器调试版是同源，开启反而会让加载失败。
    if (this.crossOrigin)
      video.crossOrigin = 'anonymous'
    video.style.position = 'absolute'
    video.style.inset = '0'
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'contain'
    video.style.opacity = '0'
    video.style.transition = `opacity ${this.fadeMs}ms ease`
    return video
  }

  /** 等待片段可以顺畅播放，出错或超时都按失败处理。 */
  private waitForPlayable(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('canplay', onReady)
        video.removeEventListener('error', onError)
        window.clearTimeout(timer)
      }
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error(`片段加载失败：${video.src}`))
      }
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error(`片段加载超时：${video.src}`))
      }, LOAD_TIMEOUT_MS)

      video.addEventListener('canplay', onReady)
      video.addEventListener('error', onError)
      // 设置 src 已经隐式触发加载，这里不再重复调用 load()。
    })
  }
}

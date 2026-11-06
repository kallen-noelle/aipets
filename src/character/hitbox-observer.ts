/**
 * 轮廓观察器：定期采样当前视频帧，把角色可见区域上报给主进程。
 *
 * 采样在低分辨率画布上做，160 像素宽的扫描成本可以忽略。读不到像素
 * （画布被污染）时保持上一次的轮廓，避免点击区域闪断。
 */

import { alphaBounds, containRect, mapSampleBounds, type Bounds } from './hitbox'

export interface AlphaHitboxOptions {
  container: HTMLElement
  /** 当前在播放的视频层。切换片段时返回的节点会变。 */
  video: () => HTMLVideoElement | null
  onBounds: (bounds: Bounds) => void
  intervalMs?: number
  sampleWidth?: number
}

export class AlphaHitboxObserver {
  private readonly options: AlphaHitboxOptions
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D | null
  private readonly intervalMs: number
  private readonly sampleWidth: number
  private timer: number | null = null

  constructor(options: AlphaHitboxOptions) {
    this.options = options
    this.canvas = document.createElement('canvas')
    this.context = this.canvas.getContext('2d', { willReadFrequently: true })
    this.intervalMs = options.intervalMs ?? 400
    this.sampleWidth = options.sampleWidth ?? 160
  }

  start(): void {
    if (this.timer !== null)
      return

    this.tick()
    this.timer = window.setInterval(() => this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer !== null)
      window.clearInterval(this.timer)
    this.timer = null
  }

  /** 立即采样一次，用于片段切换后马上更新轮廓。 */
  refresh(): void {
    this.tick()
  }

  private tick(): void {
    const { container, video, onBounds } = this.options
    const node = video()
    if (!node || !this.context || node.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      return

    const videoWidth = node.videoWidth
    const videoHeight = node.videoHeight
    if (videoWidth <= 0 || videoHeight <= 0)
      return

    const sampleWidth = this.sampleWidth
    const sampleHeight = Math.max(1, Math.round(sampleWidth * videoHeight / videoWidth))
    if (this.canvas.width !== sampleWidth || this.canvas.height !== sampleHeight) {
      this.canvas.width = sampleWidth
      this.canvas.height = sampleHeight
    }

    this.context.clearRect(0, 0, sampleWidth, sampleHeight)
    this.context.drawImage(node, 0, 0, sampleWidth, sampleHeight)

    let pixels: Uint8ClampedArray
    try {
      pixels = this.context.getImageData(0, 0, sampleWidth, sampleHeight).data
    }
    catch {
      // 画布被污染时不更新，保留上一次的轮廓。
      return
    }

    const sample = alphaBounds(pixels, sampleWidth, sampleHeight)
    const box = container.getBoundingClientRect()
    const frame = containRect(box.width, box.height, videoWidth, videoHeight)
    const bounds = sample
      ? mapSampleBounds(sample, sampleWidth, sampleHeight, frame)
      : { x: frame.x, y: frame.y, width: 0, height: 0 }

    // 容器在页面中的偏移要和轮廓相加，主进程用的是内容区坐标。
    onBounds({
      x: box.x + bounds.x,
      y: box.y + bounds.y,
      width: bounds.width,
      height: bounds.height,
    })
  }
}

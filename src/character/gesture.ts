/**
 * 手势识别：区分点击与拖拽。
 *
 * 窗口会跟随光标移动，所以指针相对窗口的坐标不变，必须用屏幕坐标判断
 * 位移。识别结果交给导演，组件只负责转发事件。
 */

export interface PointerSample {
  x: number
  y: number
  time: number
}

export type GestureResult = 'drag-started' | 'drag-ended' | 'tap' | null

export interface GestureOptions {
  /** 判定为拖拽的位移阈值，屏幕像素。 */
  threshold?: number
  /** 点按时长的上限，超过算长按，不触发回应。 */
  tapMaxMs?: number
}

export class GestureRecognizer {
  private readonly threshold: number
  private readonly tapMaxMs: number
  private start: PointerSample | null = null
  private dragging = false

  constructor(options: GestureOptions = {}) {
    this.threshold = options.threshold ?? 6
    this.tapMaxMs = options.tapMaxMs ?? 600
  }

  down(point: PointerSample): void {
    this.start = point
    this.dragging = false
  }

  /** 移动中可能产生拖拽开始事件。 */
  move(point: PointerSample): GestureResult {
    if (!this.start || this.dragging)
      return null

    const dx = point.x - this.start.x
    const dy = point.y - this.start.y
    if (Math.hypot(dx, dy) < this.threshold)
      return null

    this.dragging = true
    return 'drag-started'
  }

  /** 松手时判定拖拽结束或点击。 */
  up(point: PointerSample): GestureResult {
    if (!this.start)
      return null

    const wasDragging = this.dragging
    const elapsed = point.time - this.start.time
    this.start = null
    this.dragging = false

    if (wasDragging)
      return 'drag-ended'

    return elapsed <= this.tapMaxMs ? 'tap' : null
  }
}

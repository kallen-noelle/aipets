/**
 * 网页端的拖拽物理。
 *
 * 指针拖拽时元素跟随光标；松手速度超过阈值就保留惯性，按摩擦减速，碰到
 * 视口边缘反弹。桌面外壳移动的是窗口，不使用这个类。
 */

export interface DragOffset {
  x: number
  y: number
}

/** 元素可移动的范围，取值相对元素未偏移时的位置。 */
export interface DragBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** 松手速度阈值，低于它不甩动。 */
const FLING_THRESHOLD = 380
const FRICTION = 0.94
const RESTITUTION = 0.55
/** 惯性停止速度，单位像素每秒。 */
const STOP_SPEED = 20

export class DragPhysics {
  private readonly bounds: () => DragBounds
  private readonly onChange: () => void
  private current: DragOffset = { x: 0, y: 0 }
  private velocity: DragOffset = { x: 0, y: 0 }
  private dragging = false
  private moved = 0
  private frame: number | null = null

  constructor(bounds: () => DragBounds, onChange: () => void) {
    this.bounds = bounds
    this.onChange = onChange
  }

  get offset(): DragOffset {
    return this.current
  }

  get isDragging(): boolean {
    return this.dragging
  }

  /** 本次手势累计移动的像素，用来区分点击与拖拽。 */
  get distance(): number {
    return this.moved
  }

  /** 开始一次拖拽，接管仍在滑动的元素。 */
  start(): void {
    this.cancel()
    this.dragging = true
    this.moved = 0
    this.velocity = { x: 0, y: 0 }
    this.onChange()
  }

  /** 按指针位移移动元素，`dtMs` 用于估算速度。 */
  move(dx: number, dy: number, dtMs: number): void {
    if (!this.dragging)
      return

    const seconds = Math.max(8, dtMs) / 1000
    this.velocity.x = this.velocity.x * 0.7 + (dx / seconds) * 0.3
    this.velocity.y = this.velocity.y * 0.7 + (dy / seconds) * 0.3
    this.current = { x: this.current.x + dx, y: this.current.y + dy }
    this.moved += Math.abs(dx) + Math.abs(dy)
    this.onChange()
  }

  /** 松开指针：低于阈值就停下，否则带着速度滑动。 */
  end(): void {
    if (!this.dragging)
      return

    this.dragging = false
    if (Math.hypot(this.velocity.x, this.velocity.y) < FLING_THRESHOLD)
      this.velocity = { x: 0, y: 0 }

    this.onChange()
    if (this.velocity.x !== 0 || this.velocity.y !== 0)
      this.run()
  }

  dispose(): void {
    this.cancel()
    this.dragging = false
  }

  private run(): void {
    let previous = performance.now()

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - previous) / 1000)
      previous = now

      const limit = this.bounds()
      let { x, y } = this.current
      let { x: vx, y: vy } = this.velocity

      x += vx * dt
      y += vy * dt
      vx *= FRICTION ** (dt * 60)
      vy *= FRICTION ** (dt * 60)

      if (x < limit.minX) {
        x = limit.minX
        vx = Math.abs(vx) * RESTITUTION
      }
      else if (x > limit.maxX) {
        x = limit.maxX
        vx = -Math.abs(vx) * RESTITUTION
      }

      if (y < limit.minY) {
        y = limit.minY
        vy = Math.abs(vy) * RESTITUTION
      }
      else if (y > limit.maxY) {
        y = limit.maxY
        vy = -Math.abs(vy) * RESTITUTION
      }

      this.current = { x, y }
      this.velocity = { x: vx, y: vy }
      this.onChange()

      if (Math.hypot(vx, vy) < STOP_SPEED) {
        this.velocity = { x: 0, y: 0 }
        this.frame = null
        return
      }

      this.frame = requestAnimationFrame(step)
    }

    this.frame = requestAnimationFrame(step)
  }

  private cancel(): void {
    if (this.frame !== null)
      cancelAnimationFrame(this.frame)
    this.frame = null
  }
}

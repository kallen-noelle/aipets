/**
 * aipets 的次级窗口管理。
 *
 * 桌宠窗口留在 `main.cjs`，因为托盘、穿透状态和关闭进托盘的规则都要读它。
 * 这个管理器负责其余窗口：聊天窗口和设置窗口。
 *
 * 每个窗口在主进程存储里记住自己的边界，且边界会被夹回仍然接着的显示器，
 * 窗口永远不会恢复到一个已被拔掉的显示器上。
 */

const process = require('node:process')

const { BrowserWindow, screen, shell } = require('electron')

const WINDOW_CONFIG = {
  chat: {
    width: 460,
    height: 680,
    minWidth: 380,
    minHeight: 480,
    route: '/chat',
    title: 'aipets 聊天',
    // 无边框：标题栏由渲染层画，只保留一条可拖动的窄条和关闭按钮。
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    // 不使用 Acrylic。Windows 11 的 acrylic 在窗口首次显示时会先以半透明
    // 状态出现一帧，肉眼看到的就是打开瞬间闪一下。纯色背景由页面铺满，
    // 预创建后显示时不会露出底色。
    backplate: false,
  },
  settings: {
    width: 1080,
    height: 740,
    minWidth: 780,
    minHeight: 520,
    route: '/settings',
    title: 'aipets 设置',
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    backplate: true,
  },
}

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return width * height
}

function centered(area, width, height) {
  const fitWidth = Math.min(width, area.width)
  const fitHeight = Math.min(height, area.height)

  return {
    width: fitWidth,
    height: fitHeight,
    x: Math.round(area.x + (area.width - fitWidth) / 2),
    y: Math.round(area.y + (area.height - fitHeight) / 2),
  }
}

/**
 * 返回覆盖窗口面积最大的显示器，窗口落在所有显示器之外时返回 null。
 */
function bestDisplay(bounds) {
  let best = null
  let bestArea = 0

  for (const display of screen.getAllDisplays()) {
    const area = intersectionArea(bounds, display.workArea)
    if (area > bestArea) {
      bestArea = area
      best = display
    }
  }

  return best
}

function clampSize(value, fallback, minimum) {
  if (!Number.isFinite(value))
    return fallback

  return Math.max(minimum, Math.round(value))
}

function normalizeBounds(kind, stored) {
  const config = WINDOW_CONFIG[kind]
  const width = clampSize(stored?.width, config.width, config.minWidth)
  const height = clampSize(stored?.height, config.height, config.minHeight)
  const hasPosition = Number.isFinite(stored?.x) && Number.isFinite(stored?.y)
  const display = hasPosition ? bestDisplay({ x: stored.x, y: stored.y, width, height }) : null

  if (!display)
    return centered(screen.getPrimaryDisplay().workArea, width, height)

  const area = display.workArea
  const fitWidth = Math.min(width, area.width)
  const fitHeight = Math.min(height, area.height)

  return {
    width: fitWidth,
    height: fitHeight,
    x: Math.min(Math.max(stored.x, area.x), area.x + area.width - fitWidth),
    y: Math.min(Math.max(stored.y, area.y), area.y + area.height - fitHeight),
  }
}

class SecondaryWindows {
  constructor({ preloadPath, iconPath, routeUrl, store, onChange }) {
    this.preloadPath = preloadPath
    this.iconPath = iconPath
    this.routeUrl = routeUrl
    this.store = store
    this.onChange = onChange
    this.windows = new Map()
  }

  readBounds(kind) {
    const windows = this.store.get().windows
    if (!windows || typeof windows !== 'object')
      return undefined

    return windows[kind]
  }

  saveBounds(kind, window) {
    if (window.isDestroyed())
      return

    const windows = this.store.get().windows ?? {}
    this.store.set({
      windows: { ...windows, [kind]: window.getNormalBounds() },
    })
  }

  /** 返回某种窗口的存活实例，已关闭时返回 null。 */
  resolve(kind) {
    const window = this.windows.get(kind)
    if (window && !window.isDestroyed())
      return window

    this.windows.delete(kind)
    return null
  }

  list() {
    return Object.keys(WINDOW_CONFIG).map((kind) => {
      const window = this.resolve(kind)
      return {
        kind,
        open: Boolean(window),
        visible: window?.isVisible() ?? false,
        focused: window?.isFocused() ?? false,
        alwaysOnTop: window?.isAlwaysOnTop() ?? false,
      }
    })
  }

  notify() {
    this.onChange?.(this.list())
  }

  options(kind, bounds) {
    const config = WINDOW_CONFIG[kind]
    const base = {
      ...bounds,
      minWidth: config.minWidth,
      minHeight: config.minHeight,
      title: config.title,
      icon: this.iconPath,
      frame: config.frame,
      transparent: config.transparent,
      resizable: true,
      skipTaskbar: config.skipTaskbar,
      alwaysOnTop: config.alwaysOnTop,
      hasShadow: !config.transparent,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        // preload 需要 require 共享契约模块，沙箱 preload 不能加载本地文件，
        // 所以关掉沙箱、保留上下文隔离。
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    }

    if (!config.backplate)
      return base

    // 目标只有 Windows。Acrylic 是 Windows 11 的原生背景材质。
    if (process.platform === 'win32')
      return { ...base, backgroundMaterial: 'acrylic' }

    return { ...base, backgroundColor: '#0e0e12' }
  }

  open(kind, route, options = {}) {
    const config = WINDOW_CONFIG[kind]
    if (!config)
      throw new Error(`未知的窗口种类：${kind}`)

    const existing = this.resolve(kind)
    if (existing) {
      // show: false 时只返回窗口，由调用方定位后再显示，避免在旧位置闪一帧。
      if (options.show !== false) {
        existing.show()
        existing.focus()
      }
      this.notify()
      return existing
    }

    const bounds = normalizeBounds(kind, this.readBounds(kind))
    const window = new BrowserWindow(this.options(kind, bounds))
    this.windows.set(kind, window)

    // 预创建时传 show: false，窗口保持隐藏，点击时再直接显示。
    if (options.show !== false)
      window.once('ready-to-show', () => window.show())

    window.on('move', () => this.saveBounds(kind, window))
    window.on('resize', () => this.saveBounds(kind, window))
    window.on('closed', () => {
      this.windows.delete(kind)
      this.notify()
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    void window.loadURL(this.routeUrl(route ?? config.route))
    this.notify()
    return window
  }

  /**
   * 预创建窗口但不显示。
   *
   * 聊天窗口常驻但隐藏，点击悬浮球时直接 show，避免每次点击都重新加载页面。
   */
  preload(kind) {
    const existing = this.resolve(kind)
    if (existing)
      return existing

    return this.open(kind, undefined, { show: false })
  }

  /** 隐藏但不销毁，再次打开时无需重新加载页面。 */
  hide(kind) {
    const window = this.resolve(kind)
    if (!window || window.isDestroyed())
      return false

    window.hide()
    this.notify()
    return true
  }

  close(kind) {
    const window = this.resolve(kind)
    if (!window)
      return false

    window.close()
    return true
  }

  focus(kind) {
    const window = this.resolve(kind)
    if (!window)
      return false

    if (!window.isVisible())
      window.show()

    window.focus()
    return true
  }

  /**
   * 显示器变化后，把窗口移回仍然可见的显示器。
   */
  reflow() {
    for (const kind of this.windows.keys()) {
      const window = this.resolve(kind)
      if (!window)
        continue

      const current = window.getBounds()
      const next = normalizeBounds(kind, current)
      if (
        next.x !== current.x
        || next.y !== current.y
        || next.width !== current.width
        || next.height !== current.height
      ) {
        window.setBounds(next)
      }
    }

    this.notify()
  }

  closeAll() {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed())
        window.destroy()
    }

    this.windows.clear()
  }
}

module.exports = { SecondaryWindows, WINDOW_CONFIG }

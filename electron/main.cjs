/**
 * aipets 桌面端主进程。
 *
 * 桌宠窗口是宿主：透明、无边框、置顶。`/pet` 路由只渲染角色。聊天与设置窗口
 * 各自独立。在角色上右键可以打开这两个窗口。托盘与全局快捷键是桌宠被隐藏或
 * 开启穿透后的唯一退路。
 *
 * 启动方式：
 *   npm run dev:electron   （先拉起 Vite，再启动 Electron）
 *   npm run dist           （打包后入口为 dist/index.html）
 */

const os = require('node:os')
const path = require('node:path')
const process = require('node:process')
const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} = require('electron')

const { CHANNELS, PREFERENCES_DEFAULTS } = require('./shared/contract.cjs')
const { JsonStore } = require('./shared/store.cjs')
const { SecondaryWindows } = require('./windows.cjs')
const { PluginHost } = require('./plugins/host.cjs')
const { registerPluginScheme } = require('./plugins/gamelet.cjs')
const { createResourceServer } = require('./resource-server.cjs')

// 以 `electron electron/main.cjs` 启动时 ARG 指向单个文件，Electron 找不到
// package.json，应用名会退化成 "Electron"，userData 目录随之跑偏。显式设置
// 名称必须在读取任何 userData 路径之前完成。
app.setName('aipets')

// 用户配置固定放在 %USERPROFILE%\.aipet，打包版与开发版共用同一目录。
// 必须在任何 JsonStore / getPath('userData') 之前设置。
app.setPath('userData', path.join(os.homedir(), '.aipet'))

// 开发服务器固定监听 IPv4：localhost 在部分环境解析到 ::1，Electron 与
// 浏览器的解析结果不一致会导致连不上。
const DEV_URL = process.env.AIPETS_URL ?? 'http://127.0.0.1:5173'
const DEV_ORIGIN = new URL(DEV_URL).origin

/**
 * 是否运行开发服务器。
 *
 * `app.isPackaged` 在 app 路径指向单个文件时会误判为已打包，所以改用
 * `process.defaultApp`：`electron <脚本>` 启动时为 true，打包后为 undefined。
 * 显式设置 AIPETS_URL 时一律视为开发模式。
 */
const IS_DEV_MODE = Boolean(process.env.AIPETS_URL) || process.defaultApp === true

// main 角色的画布是 640 x 360（characters.config.json 的 canvas），窗口作为
// 角色的相框保持同样的纵横比，视频以 contain 填充就不会被裁剪。
const WINDOW_DEFAULTS = { width: 480, height: 270 }
const MIN_WIDTH = 135
const MIN_HEIGHT = 240

// 两个存储都保存主进程状态，渲染层从不写这些文件。
const preferencesStore = new JsonStore(
  path.join(app.getPath('userData'), 'desktop-preferences.json'),
  PREFERENCES_DEFAULTS,
)
const windowStateStore = new JsonStore(
  path.join(app.getPath('userData'), 'window-state.json'),
  { pets: {}, windows: {} },
)

let preferences = preferencesStore.get()
let secondaryWindows = null
/** 插件宿主在应用就绪后创建。 */
let pluginHost = null
/** 打包后渲染层通过本地 HTTP 读取角色资源。 */
let resourceServer = null
let resourceBase = ''
/** 用户主动退出时置位，关闭处理器放行窗口关闭。 */
let isQuitting = false

// 插件游戏窗口需要在应用就绪之前声明协议。
registerPluginScheme()

/**
 * 角色素材根目录。
 *
 * 打包后由 electron-builder 的 extraResources 复制到 `resources/characters`，
 * 与 app.asar 同级；开发模式直接读项目根目录的 assets/characters。
 */
function charactersBase() {
  if (app.isPackaged)
    return path.join(process.resourcesPath, 'characters')

  return path.join(__dirname, '..', 'assets', 'characters')
}

const iconPath = () => path.join(__dirname, 'resources', 'icon.png')

/**
 * 桌宠窗口条目。
 *
 * 每个启用的角色实例一个窗口，各自持有命中区域、指针模式、拖拽起点与缩放。
 * 渲染层上报实例列表之前，启动窗口是占位窗口，由第一个实例接管。
 */
const petWindows = []

let tray = null
/** 桌面聊天悬浮球窗口，常驻置顶。 */
let ballWindow = null
let ballDragOrigin = null
let ballDragTimer = null
let clickThrough = false
/** 重建托盘菜单，让菜单文案跟随窗口状态。 */
let rebuildTrayMenu = null
/** 上一次同步的实例集合，用来分辨新增实例与用户关闭的窗口。 */
let lastSyncedIds = new Set()
/** 用户关闭了全部桌宠，普通同步不应重新打开。 */
let petsDismissed = false

/** 存活的桌宠窗口，按创建顺序排列。 */
function livePets() {
  return petWindows.filter(entry => !entry.window.isDestroyed())
}

/** 托盘与快捷键作用的窗口。 */
function primaryPetWindow() {
  return livePets()[0]?.window ?? null
}

/** 找出 IPC 消息所属的桌宠窗口。 */
function petOfSender(webContents) {
  const window = BrowserWindow.fromWebContents(webContents)
  if (!window)
    return null

  return livePets().find(entry => entry.window === window) ?? null
}

/** 边界存储键，每个实例记住自己的位置。 */
function petStateKey(entry) {
  return entry.instanceId ?? 'default'
}

/**
 * 把缩放换算成窗口尺寸。
 *
 * 尺寸永远由基准画布乘缩放算出，不从 `getBounds()` 回读。Windows 在 150%
 * 缩放下回读值会比设置值多 1～2 DIP，把它再写回窗口就会一次比一次大。
 */
function petWindowSize(scale) {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    // 与 createPetWindow 的 minWidth / minHeight 保持一致，避免小缩放时
    // 保存的尺寸和实际窗口尺寸对不上。
    width: Math.max(MIN_WIDTH, Math.round(WINDOW_DEFAULTS.width * factor)),
    height: Math.max(MIN_HEIGHT, Math.round(WINDOW_DEFAULTS.height * factor)),
  }
}

function readPetState(key) {
  const pets = windowStateStore.get().pets
  const state = pets && typeof pets === 'object' ? pets[key] : undefined

  return {
    x: Number.isFinite(state?.x) ? state.x : undefined,
    y: Number.isFinite(state?.y) ? state.y : undefined,
    scale: Number.isFinite(state?.scale) ? state.scale : 1,
  }
}

function savePetBounds(entry) {
  if (entry.window.isDestroyed())
    return

  // 只记位置与缩放。宽高由缩放推导，避免把回读出来的偏差持久化下去。
  const bounds = entry.window.getNormalBounds()
  const pets = windowStateStore.get().pets ?? {}
  windowStateStore.set({
    pets: { ...pets, [petStateKey(entry)]: { x: bounds.x, y: bounds.y, scale: entry.scale || 1 } },
  })
}

function saveAllPetBounds() {
  for (const entry of livePets())
    savePetBounds(entry)

  windowStateStore.flush()
}

/**
 * 构建某个路由的应用地址，兼容 dev 服务器与打包后的 file://。
 *
 * 桌面版永远加载 desktop.html；index.html 只属于网页版。
 */
function routeUrl(route) {
  const hash = route.startsWith('/') ? `#${route}` : `#/${route}`
  if (IS_DEV_MODE)
    return new URL(`desktop.html${hash}`, DEV_URL).toString()

  return `file://${path.join(__dirname, '..', 'dist', 'desktop.html').replace(/\\/g, '/')}${hash}`
}

/** 给一个桌宠窗口应用指针模式。 */
function setPointerIgnored(entry, value) {
  if (entry.window.isDestroyed() || entry.pointerIgnored === value)
    return

  entry.pointerIgnored = value
  entry.window.setIgnoreMouseEvents(value, { forward: true })
}

/**
 * 角色轮廓之外忽略指针，桌面保住自己的点击。手动穿透开关打开时优先。
 */
function updatePointerPassthrough() {
  const cursor = screen.getCursorScreenPoint()

  for (const entry of livePets()) {
    if (!entry.window.isVisible())
      continue

    if (clickThrough || !entry.hitbox) {
      setPointerIgnored(entry, true)
      continue
    }

    const content = entry.window.getContentBounds()
    const x = cursor.x - content.x
    const y = cursor.y - content.y
    const inside = x >= entry.hitbox.x && x <= entry.hitbox.x + entry.hitbox.width
      && y >= entry.hitbox.y && y <= entry.hitbox.y + entry.hitbox.height

    setPointerIgnored(entry, !inside)
  }
}

// 桌面甩动与网页舞台的手感一致：松手速度超过阈值就保持惯性，按摩擦减速，
// 碰到工作区边缘反弹。
const DRAG_FLING_THRESHOLD = 380
const DRAG_FRICTION = 0.94
const DRAG_RESTITUTION = 0.55
const DRAG_STOP_SPEED = 20

function followPetDrag(entry) {
  if (!entry.dragOrigin || entry.window.isDestroyed()) {
    stopPetDrag(entry, { fling: false })
    return
  }

  const cursor = screen.getCursorScreenPoint()
  entry.dragSamples.push({ x: cursor.x, y: cursor.y, time: Date.now() })
  if (entry.dragSamples.length > 8)
    entry.dragSamples.shift()

  // 必须显式带宽高。Windows 在 150% 缩放下，透明无边框窗口每调用一次
  // setPosition 就会把窗口宽度多算 1～2 DIP，拖动几秒角色就会越来越大。
  const origin = entry.dragOrigin.window
  entry.window.setBounds({
    x: Math.round(origin.x + cursor.x - entry.dragOrigin.cursor.x),
    y: Math.round(origin.y + cursor.y - entry.dragOrigin.cursor.y),
    width: origin.width,
    height: origin.height,
  })
}

/** 松手瞬间的光标速度，单位是 CSS 像素每秒。 */
function dragReleaseVelocity(samples) {
  if (samples.length < 2)
    return { x: 0, y: 0 }

  const last = samples[samples.length - 1]
  // 只看最后的时刻，松手前的停顿不应触发甩动。
  const first = samples.find(sample => last.time - sample.time <= 120) ?? samples[0]
  const seconds = (last.time - first.time) / 1000
  if (seconds <= 0)
    return { x: 0, y: 0 }

  return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds }
}

/**
 * 让窗口带着松手速度滑动。
 *
 * 窗口就是角色，所以移动窗口就是桌面版的甩动。窗口停在工作区内，不会回到
 * 拖拽的起点。
 */
function flingPetWindow(entry, velocity) {
  if (!entry || Math.hypot(velocity.x, velocity.y) < DRAG_FLING_THRESHOLD)
    return

  let vx = velocity.x
  let vy = velocity.y
  let previous = Date.now()

  // 尺寸只在开始甩动时按缩放算一次，循环里不再回读窗口。Windows 在 150%
  // 缩放下 getBounds 会比设置值多 1～2 DIP，反复回读会让窗口一边反弹一边
  // 变大。位置也在局部变量里累加。
  const start = entry.window.getBounds()
  const { width, height } = petWindowSize(entry.scale)
  let currentX = start.x
  let currentY = start.y

  entry.flingTimer = setInterval(() => {
    if (entry.window.isDestroyed()) {
      clearInterval(entry.flingTimer)
      entry.flingTimer = null
      return
    }

    const now = Date.now()
    const dt = Math.min(0.05, (now - previous) / 1000)
    previous = now

    const area = screen.getDisplayMatching({ x: currentX, y: currentY, width, height }).workArea
    const minX = area.x
    const minY = area.y
    const maxX = area.x + area.width - width
    const maxY = area.y + area.height - height

    let x = currentX + vx * dt
    let y = currentY + vy * dt

    if (x <= minX) {
      x = minX
      vx = Math.abs(vx) * DRAG_RESTITUTION
    }
    else if (x >= maxX) {
      x = maxX
      vx = -Math.abs(vx) * DRAG_RESTITUTION
    }

    if (y <= minY) {
      y = minY
      vy = Math.abs(vy) * DRAG_RESTITUTION
    }
    else if (y >= maxY) {
      y = maxY
      vy = -Math.abs(vy) * DRAG_RESTITUTION
    }

    const decay = DRAG_FRICTION ** (dt * 60)
    vx *= decay
    vy *= decay

    currentX = Math.round(x)
    currentY = Math.round(y)

    entry.window.setBounds({
      x: currentX,
      y: currentY,
      width,
      height,
    })

    if (Math.hypot(vx, vy) < DRAG_STOP_SPEED) {
      clearInterval(entry.flingTimer)
      entry.flingTimer = null
    }
  }, 16)
}

function startPetDrag(entry) {
  if (entry.window.isDestroyed())
    return

  // 新的拖拽接管仍在滑动的窗口。
  stopPetDrag(entry, { fling: false })
  const cursor = screen.getCursorScreenPoint()
  const bounds = entry.window.getBounds()
  const size = petWindowSize(entry.scale)
  entry.dragOrigin = {
    cursor,
    window: {
      x: bounds.x,
      y: bounds.y,
      // 尺寸按缩放算，不用回读值，拖动时窗口不会缓慢变大。
      width: size.width,
      height: size.height,
    },
  }
  entry.dragSamples = [{ x: cursor.x, y: cursor.y, time: Date.now() }]
  // 窗口跟随光标，指针始终停在同一个点上。
  entry.dragTimer = setInterval(() => followPetDrag(entry), 16)
}

function stopPetDrag(entry, { fling = true } = {}) {
  if (!entry)
    return

  if (entry.dragTimer)
    clearInterval(entry.dragTimer)

  entry.dragTimer = null
  entry.dragOrigin = null

  if (entry.flingTimer) {
    clearInterval(entry.flingTimer)
    entry.flingTimer = null
  }

  const samples = entry.dragSamples
  entry.dragSamples = []

  if (fling)
    flingPetWindow(entry, dragReleaseVelocity(samples))
}

/**
 * 桌面聊天悬浮球的窗口尺寸。
 *
 * 球体本身 56px，窗口留一圈透明边距放阴影与 hover 放大。
 */
const BALL_SIZE = 72

/** 把矩形夹回最近的显示器工作区，保证球不会被拖出屏幕。 */
function clampBallBounds(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height),
    width: bounds.width,
    height: bounds.height,
  }
}

/** 悬浮球位置写进 window-state.json 的 windows.ball。 */
function saveBallBounds() {
  if (!ballWindow || ballWindow.isDestroyed())
    return

  const windows = windowStateStore.get().windows ?? {}
  windowStateStore.set({ windows: { ...windows, ball: ballWindow.getNormalBounds() } })
}

/** 创建常驻的聊天悬浮球窗口；退出前不会关闭。 */
function createBallWindow() {
  if (ballWindow && !ballWindow.isDestroyed())
    return

  const saved = windowStateStore.get().windows?.ball
  const area = screen.getPrimaryDisplay().workArea
  const fallback = {
    x: area.x + area.width - BALL_SIZE - 24,
    y: area.y + area.height - BALL_SIZE - 48,
    width: BALL_SIZE,
    height: BALL_SIZE,
  }
  const hasSaved = Number.isFinite(saved?.x) && Number.isFinite(saved?.y)
  const bounds = clampBallBounds(hasSaved
    ? { x: saved.x, y: saved.y, width: BALL_SIZE, height: BALL_SIZE }
    : fallback)

  ballWindow = new BrowserWindow({
    ...bounds,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'aipets 聊天球',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  ballWindow.setAlwaysOnTop(true, 'screen-saver')
  ballWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  void ballWindow.loadURL(routeUrl('/ball'))
  ballWindow.on('move', () => saveBallBounds())
  ballWindow.on('closed', () => {
    stopBallDrag()
    ballWindow = null
  })

  // 首次位置也写回存储，重启后从同一处出现。
  saveBallBounds()
}

function followBallDrag() {
  if (!ballDragOrigin || !ballWindow || ballWindow.isDestroyed()) {
    stopBallDrag()
    return
  }

  const cursor = screen.getCursorScreenPoint()
  const origin = ballDragOrigin.window
  // 与桌宠拖拽一样固定宽高，避免高 DPI 下窗口越拖越大。
  ballWindow.setBounds({
    x: Math.round(origin.x + cursor.x - ballDragOrigin.cursor.x),
    y: Math.round(origin.y + cursor.y - ballDragOrigin.cursor.y),
    width: origin.width,
    height: origin.height,
  })
}

function startBallDrag() {
  if (!ballWindow || ballWindow.isDestroyed())
    return

  stopBallDrag()
  const cursor = screen.getCursorScreenPoint()
  const bounds = ballWindow.getBounds()
  ballDragOrigin = {
    cursor,
    window: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  }
  ballDragTimer = setInterval(followBallDrag, 16)
}

function stopBallDrag() {
  if (ballDragTimer)
    clearInterval(ballDragTimer)

  ballDragTimer = null
  ballDragOrigin = null

  if (ballWindow && !ballWindow.isDestroyed()) {
    const bounds = ballWindow.getBounds()
    const clamped = clampBallBounds(bounds)
    if (clamped.x !== bounds.x || clamped.y !== bounds.y)
      ballWindow.setBounds(clamped)
    saveBallBounds()
  }
}

/** 点击悬浮球：聊天窗口已打开就收起，否则在旁边展开。 */
function toggleChatWindow() {
  if (!ballWindow || ballWindow.isDestroyed() || !secondaryWindows)
    return

  const existing = secondaryWindows.resolve('chat')
  if (existing && existing.isVisible()) {
    // 隐藏而不是关闭，下次点击直接显示，不再重新加载页面。
    secondaryWindows.hide('chat')
    return
  }

  // 取窗口但不立刻显示：先把窗口定位到球旁边，再 show，避免先在旧位置
  // 闪一帧再跳过来。
  const chat = secondaryWindows.open('chat', undefined, { show: false })
  if (!chat || chat.isDestroyed())
    return

  // 聊天窗贴着球展开：优先左侧，空间不足时放到右侧，垂直居中后夹回工作区。
  const ball = ballWindow.getBounds()
  const bounds = chat.getBounds()
  const area = screen.getDisplayMatching(ball).workArea
  const gap = 12
  let x = ball.x - bounds.width - gap
  if (x < area.x)
    x = ball.x + ball.width + gap
  x = Math.min(Math.max(x, area.x), area.x + area.width - bounds.width)
  let y = Math.round(ball.y + ball.height / 2 - bounds.height / 2)
  y = Math.min(Math.max(y, area.y), area.y + area.height - bounds.height)

  chat.setBounds({ x, y, width: bounds.width, height: bounds.height })

  if (chat.webContents.isLoading()) {
    chat.once('ready-to-show', () => {
      if (chat.isDestroyed())
        return

      chat.show()
      chat.focus()
    })
  }
  else {
    chat.show()
    chat.focus()
  }
}


/**
 * 把桌宠窗口缩放到角色的大小。
 *
 * 窗口就是角色的相框，更大的角色占用更大的窗口，而不是在固定窗口里被裁剪。
 * 底边保持不动，角色留在用户放置的位置。
 */
function applyPetScale(entry, scale) {
  if (entry.window.isDestroyed() || !Number.isFinite(scale) || scale <= 0)
    return

  // 窗口不超出显示器，最大缩放也能放下。最小缩放停在窗口最小尺寸。
  const bounds = entry.window.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const fits = Math.min(area.width / WINDOW_DEFAULTS.width, area.height / WINDOW_DEFAULTS.height)
  const factor = Math.max(MIN_WIDTH / WINDOW_DEFAULTS.width, Math.min(4, scale, fits))
  if (Math.abs(factor - entry.scale) < 0.001)
    return

  entry.scale = factor

  // 尺寸只由基准画布乘缩放决定，不回读窗口，避免高 DPI 下的累计误差。
  const { width, height } = petWindowSize(factor)
  const x = Math.round(bounds.x + (bounds.width - width) / 2)
  const y = Math.round(bounds.y + bounds.height - height)

  entry.window.setBounds({
    x: Math.min(Math.max(x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(y, area.y), area.y + area.height - height),
    width,
    height,
  })
}

function applyClickThrough(value) {
  clickThrough = Boolean(value)
  // 穿透窗口收不到指针事件，托盘与全局快捷键是唯一的退路。
  updatePointerPassthrough()

  for (const entry of livePets())
    entry.window.webContents.send(CHANNELS.visibilityChanged, { clickThrough })

  rebuildTrayMenu?.()
  return clickThrough
}

/** 新桌宠的起始边界，每个新窗口从前一个错开。 */
function petWindowBounds(entry, cascade) {
  const saved = readPetState(petStateKey(entry))
  const size = petWindowSize(saved.scale)
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y))
    return { ...size, x: saved.x, y: saved.y }

  const area = screen.getPrimaryDisplay().workArea
  const anchor = primaryPetWindow()?.getBounds()
  const baseX = anchor?.x ?? Math.round(area.x + (area.width - size.width) / 2)
  const baseY = anchor?.y ?? Math.round(area.y + (area.height - size.height) / 2)
  const step = 32 * cascade

  return {
    ...size,
    x: Math.min(Math.max(baseX + step, area.x), area.x + area.width - size.width),
    y: Math.min(Math.max(baseY + step, area.y), area.y + area.height - size.height),
  }
}

/** 桌宠路由：带实例 id 时只渲染那一个实例。 */
function petRoute(instanceId) {
  return instanceId ? `/pet?instance=${encodeURIComponent(instanceId)}` : '/pet'
}

/**
 * 打开一个桌宠窗口。路由带实例 id，渲染层据此显示对应的角色与外观。
 */
function createPetWindow({ instanceId = null, cascade = 0, withDevTools = false } = {}) {
  const entry = {
    window: null,
    instanceId,
    hitbox: null,
    pointerIgnored: false,
    dragOrigin: null,
    dragTimer: null,
    dragSamples: [],
    flingTimer: null,
    // 以保存的缩放为准，窗口尺寸由它推导；渲染层上报后不会再次改变尺寸。
    scale: readPetState(instanceId ?? 'default').scale,
  }
  const bounds = petWindowBounds(entry, cascade)

  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    transparent: true,
    frame: false,
    resizable: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: false,
    title: 'aipets',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // preload 需要 require 共享契约模块，沙箱 preload 不能加载本地文件，
      // 所以关掉沙箱、保留上下文隔离。
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  entry.window = window
  petWindows.push(entry)

  // 桌宠浮在其他窗口之上，包括全屏窗口。
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  void window.loadURL(routeUrl(petRoute(instanceId)))

  window.on('move', () => savePetBounds(entry))
  window.on('resize', () => savePetBounds(entry))
  window.on('closed', () => {
    stopPetDrag(entry, { fling: false })
    const index = petWindows.indexOf(entry)
    if (index >= 0)
      petWindows.splice(index, 1)
  })

  // 关闭桌宠只是隐藏，应用常驻托盘，只有退出才真正关闭。
  window.on('close', (event) => {
    if (isQuitting || !preferences.closeToTray)
      return

    event.preventDefault()
    window.hide()
    tray?.setToolTip('aipets（已隐藏）')
  })

  // 桌宠窗口绝不能导航离开应用，外链一律交给系统浏览器。
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // DevTools 按需打开：设置 AIPETS_DEVTOOLS=1 时弹出独立调试窗口。
  if (withDevTools && process.env.AIPETS_DEVTOOLS)
    window.webContents.openDevTools({ mode: 'detach' })

  registerPetContextMenu(window)
  return entry
}

/** 关闭一个桌宠窗口并移除条目。 */
function closePetWindow(entry) {
  stopPetDrag(entry, { fling: false })
  if (!entry.window.isDestroyed())
    entry.window.destroy()

  const index = petWindows.indexOf(entry)
  if (index >= 0)
    petWindows.splice(index, 1)
}

/**
 * 每个实例开一个窗口，移除实例时关掉对应窗口。
 *
 * 启动窗口还没有实例 id，第一个实例接管它，所以不会多开一个窗口。
 */
function syncPetWindows(targets) {
  const wanted = new Set()
  for (const target of targets) {
    const id = typeof target === 'string' ? target : target?.id
    if (typeof id === 'string' && id)
      wanted.add(id)
  }

  const fresh = [...wanted].some(id => !lastSyncedIds.has(id))
  lastSyncedIds = wanted

  // 设置窗口也上报同一份列表，用户关闭的桌宠要等新增实例或托盘才回来。
  if (petsDismissed && !fresh)
    return []

  petsDismissed = false

  for (const entry of livePets()) {
    if (entry.instanceId && !wanted.has(entry.instanceId))
      closePetWindow(entry)
  }

  const assigned = new Set(livePets().map(entry => entry.instanceId).filter(Boolean))

  for (const id of wanted) {
    if (assigned.has(id))
      continue

    const placeholder = livePets().find(entry => !entry.instanceId)
    if (placeholder) {
      placeholder.instanceId = id
      // 占位窗口已经加载了 /pet，直接通知切换实例，避免二次导航丢哈希。
      placeholder.window.webContents.send(CHANNELS.petAssigned, id)
      assigned.add(id)
      continue
    }

    createPetWindow({ instanceId: id, cascade: petWindows.length })
    assigned.add(id)
  }

  return livePets().map(entry => entry.instanceId).filter(Boolean)
}

/** 一个开关显示或隐藏全部桌宠。 */
function togglePetWindow() {
  const live = livePets()
  if (!live.length) {
    // 用户关掉了全部桌宠，托盘把它们带回来。
    petsDismissed = false
    syncPetWindows([...lastSyncedIds].map(id => ({ id })))
    return
  }

  const visible = live.some(entry => entry.window.isVisible())
  for (const entry of live) {
    if (visible)
      entry.window.hide()
    else
      entry.window.show()
  }

  tray?.setToolTip(visible ? 'aipets（已隐藏）' : 'aipets')
}

/**
 * 桌宠窗口没有边框，右键菜单是唯一的入口，列出用户在桌面上需要的两个窗口。
 */
function registerPetContextMenu(window) {
  window.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '聊天', click: () => secondaryWindows?.open('chat') },
      { label: '设置', click: () => secondaryWindows?.open('settings') },
      { type: 'separator' },
      // 关闭进托盘时这一项等价于隐藏。
      { label: '隐藏桌宠', click: () => window.hide() },
    ])
    menu.popup({ window })
  })
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath())
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 }))
  tray.setToolTip('aipets')

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: '显示 / 隐藏', click: togglePetWindow },
      {
        label: clickThrough ? '停止鼠标穿透' : '开启鼠标穿透',
        click: () => applyClickThrough(!clickThrough),
      },
      { label: '聊天', click: () => secondaryWindows?.open('chat') },
      { label: '设置', click: () => secondaryWindows?.open('settings') },
      {
        label: '始终置顶',
        type: 'checkbox',
        checked: primaryPetWindow()?.isAlwaysOnTop() ?? true,
        click: (item) => {
          for (const entry of livePets()) {
            if (!entry.window.isDestroyed())
              entry.window.setAlwaysOnTop(item.checked, 'screen-saver')
          }
          rebuildTrayMenu?.()
        },
      },
      {
        label: '关闭进托盘',
        type: 'checkbox',
        checked: preferences.closeToTray,
        click: (item) => {
          preferences = preferencesStore.set({ closeToTray: item.checked })
          preferencesStore.flush()
          broadcast(CHANNELS.preferencesChanged, preferences)
          rebuildTrayMenu?.()
        },
      },
      { type: 'separator' },
      {
        label: '重新加载',
        click: () => {
          for (const entry of livePets()) {
            if (!entry.window.isDestroyed())
              entry.window.reload()
          }
        },
      },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])
    tray.setContextMenu(menu)
  }

  rebuildTrayMenu = rebuild
  rebuild()
  tray.on('click', togglePetWindow)
}

function registerShortcuts() {
  // Ctrl+Shift+P 显示或隐藏桌宠；Ctrl+Shift+L 切换鼠标穿透，这是穿透开启后
  // 唯一的退路之一。
  globalShortcut.register('CommandOrControl+Shift+P', togglePetWindow)
  globalShortcut.register('CommandOrControl+Shift+L', () => applyClickThrough(!clickThrough))
}

function broadcast(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send(channel, payload)
  }
}

// preload 在窗口创建时同步读取资源基地址，页面加载前就能确定。
ipcMain.on(CHANNELS.resourceBase, (event) => {
  event.returnValue = resourceBase
})

ipcMain.handle(CHANNELS.getInfo, () => ({
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  clickThrough,
  visible: livePets().some(entry => entry.window.isVisible()),
}))

ipcMain.handle(CHANNELS.setClickThrough, (_event, value) => applyClickThrough(value))

ipcMain.handle(CHANNELS.setVisible, (_event, value) => {
  // 关闭的桌宠用同一个开关带回来。
  if (value && livePets().length === 0)
    togglePetWindow()

  const pets = livePets()
  if (pets.length === 0)
    return false

  for (const entry of pets) {
    if (value)
      entry.window.show()
    else
      entry.window.hide()
  }

  return pets.some(entry => entry.window.isVisible())
})

// 渲染层拥有实例列表，主进程按列表开窗与关窗。
ipcMain.handle(CHANNELS.petSync, (_event, targets) => (
  syncPetWindows(Array.isArray(targets) ? targets : [])
))

// 桌宠窗口读取自己负责的实例，占位窗口返回 null。
ipcMain.handle(CHANNELS.petInstance, event => petOfSender(event.sender)?.instanceId ?? null)

ipcMain.handle(CHANNELS.getPreferences, () => ({ ...preferences }))

ipcMain.handle(CHANNELS.setPreferences, (_event, patch) => {
  if (patch && typeof patch.closeToTray === 'boolean')
    preferences = preferencesStore.set({ closeToTray: patch.closeToTray })

  preferencesStore.flush()
  rebuildTrayMenu?.()
  broadcast(CHANNELS.preferencesChanged, preferences)
  return { ...preferences }
})

ipcMain.handle(CHANNELS.windowList, () => secondaryWindows?.list() ?? [])

ipcMain.handle(CHANNELS.windowOpen, (_event, kind, route) => {
  secondaryWindows?.open(String(kind), typeof route === 'string' ? route : undefined)
  return secondaryWindows?.list() ?? []
})

ipcMain.handle(CHANNELS.windowClose, (_event, kind) => {
  secondaryWindows?.close(String(kind))
  return secondaryWindows?.list() ?? []
})

ipcMain.handle(CHANNELS.windowFocus, (_event, kind) => secondaryWindows?.focus(String(kind)) ?? false)

ipcMain.handle(CHANNELS.pluginsList, () => pluginHost?.list() ?? [])

ipcMain.handle(CHANNELS.pluginsInstall, async () => {
  const options = { title: '选择插件文件夹', properties: ['openDirectory'] }
  const owner = primaryPetWindow()
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || !result.filePaths[0] || !pluginHost)
    return pluginHost?.list() ?? []

  return pluginHost.install(result.filePaths[0])
})

ipcMain.handle(CHANNELS.pluginsSetEnabled, (_event, id, enabled) => (
  pluginHost?.setEnabled(String(id), Boolean(enabled)) ?? []
))

ipcMain.handle(CHANNELS.pluginsRemove, (_event, id) => pluginHost?.remove(String(id)) ?? [])

ipcMain.handle(CHANNELS.pluginsOpen, (_event, id, moduleId) => (
  pluginHost?.openBinding(String(id), String(moduleId)) ?? false
))

ipcMain.handle(CHANNELS.pluginsClose, (_event, id, moduleId) => (
  pluginHost?.closeBinding(String(id), String(moduleId)) ?? false
))

ipcMain.on(CHANNELS.petHitbox, (event, rect) => {
  const entry = petOfSender(event.sender)
  const values = [rect?.x, rect?.y, rect?.width, rect?.height]
  if (!entry || !values.every(value => Number.isFinite(value)))
    return

  entry.hitbox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  updatePointerPassthrough()
})

ipcMain.on(CHANNELS.petDrag, (event, phase) => {
  const entry = petOfSender(event.sender)
  if (!entry)
    return

  if (phase === 'start')
    startPetDrag(entry)
  else
    stopPetDrag(entry)
})

ipcMain.on(CHANNELS.petScale, (event, scale) => {
  const entry = petOfSender(event.sender)
  if (entry)
    applyPetScale(entry, Number(scale))
})

ipcMain.on(CHANNELS.ballDrag, (event, phase) => {
  if (!ballWindow || event.sender !== ballWindow.webContents)
    return

  if (phase === 'start')
    startBallDrag()
  else
    stopBallDrag()
})

ipcMain.handle(CHANNELS.ballToggle, (event) => {
  if (!ballWindow || event.sender !== ballWindow.webContents)
    return

  toggleChatWindow()
})

// 聊天窗口把动画信号转发到这里，每个桌宠窗口在自己的信号总线上重放。
ipcMain.on(CHANNELS.petEvent, (_event, message) => {
  for (const entry of livePets()) {
    if (!entry.window.isDestroyed())
      entry.window.webContents.send(CHANNELS.petEvent, message)
  }
})

const singleInstance = app.requestSingleInstanceLock()

if (!singleInstance) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    const pets = livePets()
    if (pets.length === 0)
      return

    for (const entry of pets)
      entry.window.show()
    primaryPetWindow()?.focus()
  })

  app.whenReady().then(async () => {
    preferences = preferencesStore.get()

    // 桌面版不需要 Electron 默认菜单条（File/Edit/View/Window/Help）。
    Menu.setApplicationMenu(null)

    pluginHost = new PluginHost({
      rootDir: path.join(app.getPath('userData'), 'plugins'),
      stateFile: path.join(app.getPath('userData'), 'plugins-state.json'),
    })

    // 资源服务与插件宿主都在启动时准备好，渲染层加载前即可读取。
    resourceServer = await createResourceServer(charactersBase())
    resourceBase = resourceServer.base

    createPetWindow()

    // 桌宠窗口跟随指针，角色之外的点击落到桌面。60ms 的轮询对用户不可见。
    setInterval(updatePointerPassthrough, 60)

    secondaryWindows = new SecondaryWindows({
      preloadPath: path.join(__dirname, 'preload.cjs'),
      iconPath: iconPath(),
      routeUrl,
      store: windowStateStore,
      onChange: list => broadcast(CHANNELS.windowsChanged, list),
    })

    // 桌面版常驻聊天悬浮球，点击切换聊天窗口。
    createBallWindow()
    // 预创建聊天窗口并保持隐藏：点击悬浮球时直接显示，避免首次点击等待页面加载。
    const chatWindow = secondaryWindows.preload('chat')

    // 聊天窗口的关闭按钮、Alt+F4 都改为隐藏，下次点击悬浮球仍然秒开。
    chatWindow.on('close', (event) => {
      if (isQuitting)
        return

      event.preventDefault()
      secondaryWindows.hide('chat')
    })

    createTray()
    registerShortcuts()

    try {
      await pluginHost.initialize()
    }
    catch {
      // 坏插件不能阻止桌宠启动。
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    saveBallBounds()
    secondaryWindows?.closeAll()
    pluginHost?.dispose()
    void resourceServer?.close()
    saveAllPetBounds()
    windowStateStore.flush()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}

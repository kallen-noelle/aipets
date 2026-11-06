/**
 * preload 桥的类型与获取函数。
 *
 * 这里的每个方法对应 `electron/shared/contract.cjs` 里的一条通道，改通道名时
 * 必须一起改对应方法。
 */

/** 桌宠窗口上报的角色矩形，坐标系是窗口内容区。 */
export interface PetHitbox {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopInfo {
  platform: string
  versions: { electron: string, chrome: string }
  clickThrough: boolean
  visible: boolean
}

export interface DesktopPreferences {
  closeToTray: boolean
}

export type SecondaryWindowKind = 'chat' | 'settings'

export interface SecondaryWindowItem {
  kind: string
  open: boolean
  visible: boolean
  focused: boolean
  alwaysOnTop: boolean
}

export interface DesktopPluginBinding {
  moduleId: string
  title: string
}

export interface DesktopPluginLog {
  at: number
  level: string
  message: string
}

export interface DesktopPlugin {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  loaded: boolean
  error: string | null
  bindings: DesktopPluginBinding[]
  logs: DesktopPluginLog[]
}

export interface DesktopBridge {
  platform: string
  versions: { electron: string, chrome: string }
  /** 打包后角色资源的本地 HTTP 基地址，开发与网页环境为空。 */
  resourceBase: string
  getInfo: () => Promise<DesktopInfo>
  setClickThrough: (value: boolean) => Promise<boolean>
  setVisible: (value: boolean) => Promise<boolean>
  onVisibilityChanged: (listener: (payload: { clickThrough: boolean }) => void) => () => void
  getPreferences: () => Promise<DesktopPreferences>
  setPreferences: (patch: Partial<DesktopPreferences>) => Promise<DesktopPreferences>
  onPreferencesChanged: (listener: (payload: DesktopPreferences) => void) => () => void
  listWindows: () => Promise<SecondaryWindowItem[]>
  openWindow: (kind: SecondaryWindowKind, route?: string) => Promise<SecondaryWindowItem[]>
  closeWindow: (kind: SecondaryWindowKind) => Promise<SecondaryWindowItem[]>
  focusWindow: (kind: SecondaryWindowKind) => Promise<boolean>
  onWindowsChanged: (listener: (payload: SecondaryWindowItem[]) => void) => () => void
  listPlugins: () => Promise<DesktopPlugin[]>
  installPlugin: () => Promise<DesktopPlugin[]>
  setPluginEnabled: (id: string, enabled: boolean) => Promise<DesktopPlugin[]>
  removePlugin: (id: string) => Promise<DesktopPlugin[]>
  openPluginBinding: (id: string, moduleId: string) => Promise<boolean>
  closePluginBinding: (id: string, moduleId: string) => Promise<boolean>
  sendPetEvent: (message: { kind: string, [key: string]: unknown }) => void
  onPetEvent: (listener: (payload: { kind: string, [key: string]: unknown }) => void) => () => void
  /** 把启用的实例列表交给主进程，每个实例一个桌宠窗口。 */
  syncPetInstances: (instanceIds: string[]) => Promise<string[]>
  /** 当前桌宠窗口被分配到的实例，占位窗口尚未分配时为 null。 */
  getPetInstanceId: () => Promise<string | null>
  /** 占位窗口被实例接管后通知渲染层。 */
  onPetAssigned: (listener: (instanceId: string) => void) => () => void
  reportPetHitbox: (rect: PetHitbox) => void
  beginPetDrag: () => void
  endPetDrag: () => void
  setPetScale: (scale: number) => void
  /** 聊天悬浮球：拖动移动球窗口，点击切换聊天窗口。 */
  beginBallDrag: () => void
  endBallDrag: () => void
  toggleChatWindow: () => Promise<void>
}

declare global {
  interface Window {
    aipetsDesktop?: DesktopBridge
  }
}

/** 返回桌面桥，浏览器环境（无 Electron）下返回 null。 */
export function getDesktopBridge(): DesktopBridge | null {
  return window.aipetsDesktop ?? null
}

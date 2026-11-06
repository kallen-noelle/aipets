/**
 * aipets 桌面端的 IPC 契约。
 *
 * 主进程与 preload 脚本是纯 CommonJS，没有构建步骤，这张表是通道名的唯一来源。
 * 渲染层镜像在 `src/desktop/bridge.ts`：桥接的每个方法调用这里的一个通道并声明
 * 载荷类型。改这里的名字时必须一起改对应方法。
 */

const CHANNELS = {
  getInfo: 'desktop:get-info',
  // 打包后角色资源的本地 HTTP 基地址，preload 同步读取。
  resourceBase: 'desktop:resource-base',
  setClickThrough: 'desktop:set-click-through',
  setVisible: 'desktop:set-visible',
  visibilityChanged: 'desktop:visibility-changed',

  getPreferences: 'desktop:get-preferences',
  setPreferences: 'desktop:set-preferences',
  preferencesChanged: 'desktop:preferences-changed',

  windowOpen: 'desktop:window-open',
  windowClose: 'desktop:window-close',
  windowList: 'desktop:window-list',
  windowFocus: 'desktop:window-focus',
  windowsChanged: 'desktop:windows-changed',

  // 本地插件：列表、安装、启停、移除与游戏窗口。
  pluginsList: 'desktop:plugins-list',
  pluginsInstall: 'desktop:plugins-install',
  pluginsSetEnabled: 'desktop:plugins-set-enabled',
  pluginsRemove: 'desktop:plugins-remove',
  pluginsOpen: 'desktop:plugins-open',
  pluginsClose: 'desktop:plugins-close',

  // 桌宠窗口的事件总线：聊天窗口把说话信号发给所有桌宠窗口。
  petEvent: 'desktop:pet-event',
  // 渲染层上报启用的实例，主进程为每个实例开一个桌宠窗口。
  petSync: 'desktop:pet-sync',
  // 桌宠窗口查询自己被分配到的实例。
  petInstance: 'desktop:pet-instance',
  // 占位窗口被实例接管后，主进程通知渲染层切换角色。
  petAssigned: 'desktop:pet-assigned',
  // 桌宠窗口上报角色矩形，轮廓外的点击穿透到桌面。
  petHitbox: 'desktop:pet-hitbox',
  // 拖拽角色移动窗口本体，所以角色永远不出窗口。
  petDrag: 'desktop:pet-drag',
  // 缩放改变窗口大小，更大的角色不会被裁剪。
  petScale: 'desktop:pet-scale',

  // 桌面聊天悬浮球：拖动移动球窗口，点击切换聊天窗口。
  ballDrag: 'desktop:ball-drag',
  ballToggle: 'desktop:ball-toggle',
}

/** 窗口管理器可以创建或定位的窗口种类。 */
const WINDOW_KINDS = ['main', 'chat', 'settings']

const PREFERENCES_DEFAULTS = {
  closeToTray: true,
}

module.exports = { CHANNELS, PREFERENCES_DEFAULTS, WINDOW_KINDS }

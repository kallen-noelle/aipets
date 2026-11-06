/**
 * aipets 桌面宿主的 preload 脚本。
 *
 * 它在 `window.aipetsDesktop` 上暴露一个小的类型化桥。渲染层拿不到 Node 或
 * Electron 对象。通道名来自共享契约，主进程与本文件不会漂移。
 */

const nodeProcess = require('node:process')

const { contextBridge, ipcRenderer } = require('electron')

const { CHANNELS } = require('./shared/contract.cjs')

function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('aipetsDesktop', {
  platform: nodeProcess.platform,
  versions: {
    electron: nodeProcess.versions.electron,
    chrome: nodeProcess.versions.chrome,
  },
  // 同步读取，页面脚本运行前就能确定角色资源地址。
  resourceBase: ipcRenderer.sendSync(CHANNELS.resourceBase),
  getInfo: () => ipcRenderer.invoke(CHANNELS.getInfo),
  setClickThrough: value => ipcRenderer.invoke(CHANNELS.setClickThrough, Boolean(value)),
  setVisible: value => ipcRenderer.invoke(CHANNELS.setVisible, Boolean(value)),
  onVisibilityChanged: listener => subscribe(CHANNELS.visibilityChanged, listener),

  getPreferences: () => ipcRenderer.invoke(CHANNELS.getPreferences),
  setPreferences: patch => ipcRenderer.invoke(CHANNELS.setPreferences, patch),
  onPreferencesChanged: listener => subscribe(CHANNELS.preferencesChanged, listener),

  listWindows: () => ipcRenderer.invoke(CHANNELS.windowList),
  openWindow: (kind, route) => ipcRenderer.invoke(CHANNELS.windowOpen, kind, route),
  closeWindow: kind => ipcRenderer.invoke(CHANNELS.windowClose, kind),
  focusWindow: kind => ipcRenderer.invoke(CHANNELS.windowFocus, kind),
  onWindowsChanged: listener => subscribe(CHANNELS.windowsChanged, listener),

  listPlugins: () => ipcRenderer.invoke(CHANNELS.pluginsList),
  installPlugin: () => ipcRenderer.invoke(CHANNELS.pluginsInstall),
  setPluginEnabled: (id, enabled) => ipcRenderer.invoke(CHANNELS.pluginsSetEnabled, id, Boolean(enabled)),
  removePlugin: id => ipcRenderer.invoke(CHANNELS.pluginsRemove, id),
  openPluginBinding: (id, moduleId) => ipcRenderer.invoke(CHANNELS.pluginsOpen, id, moduleId),
  closePluginBinding: (id, moduleId) => ipcRenderer.invoke(CHANNELS.pluginsClose, id, moduleId),

  sendPetEvent: message => ipcRenderer.send(CHANNELS.petEvent, message),
  onPetEvent: listener => subscribe(CHANNELS.petEvent, listener),
  syncPetInstances: ids => ipcRenderer.invoke(CHANNELS.petSync, ids),
  getPetInstanceId: () => ipcRenderer.invoke(CHANNELS.petInstance),
  onPetAssigned: listener => subscribe(CHANNELS.petAssigned, listener),
  reportPetHitbox: rect => ipcRenderer.send(CHANNELS.petHitbox, rect),
  beginPetDrag: () => ipcRenderer.send(CHANNELS.petDrag, 'start'),
  endPetDrag: () => ipcRenderer.send(CHANNELS.petDrag, 'end'),
  setPetScale: scale => ipcRenderer.send(CHANNELS.petScale, Number(scale)),
  beginBallDrag: () => ipcRenderer.send(CHANNELS.ballDrag, 'start'),
  endBallDrag: () => ipcRenderer.send(CHANNELS.ballDrag, 'end'),
  toggleChatWindow: () => ipcRenderer.invoke(CHANNELS.ballToggle),
})

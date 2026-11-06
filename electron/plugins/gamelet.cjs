/**
 * 插件游戏窗口与资源协议。
 *
 * 插件注册的模块可以绑定一个 iframe 游戏窗口，窗口内容由
 * `plugin-assets://` 协议从插件目录直读。
 */

const fsp = require('node:fs/promises')
const { pathToFileURL } = require('node:url')

const { BrowserWindow, net, protocol } = require('electron')

const { errorText, resolveInside } = require('./manifest.cjs')

const SCHEME = 'plugin-assets'

/** 在应用就绪之前声明协议特权。 */
function registerPluginScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

class GameletService {
  /** 记录一个模块的窗口绑定。 */
  bind(record, input) {
    const moduleId = input?.moduleId ?? `${record.manifest.id}:gamelet`
    const config = input?.config ?? {}
    const binding = {
      moduleId,
      title: typeof config.title === 'string' && config.title !== '' ? config.title : moduleId,
      widget: config.widget ?? {},
      init: config.config?.init ?? {},
    }

    record.bindings.set(moduleId, binding)
    return binding
  }

  /** 把绑定的 iframe 地址解析成协议 URL。 */
  resolveWidgetUrl(record, binding) {
    const iframe = binding.widget?.iframe
    if (iframe && typeof iframe.assetPath === 'string' && iframe.assetPath !== '') {
      const relative = iframe.assetPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')
      return `${SCHEME}://${record.manifest.id}/${relative}`
    }

    if (iframe && typeof iframe.src === 'string' && iframe.src !== '')
      return iframe.src

    throw new Error('游戏模块没有 iframe 来源。')
  }

  /** 打开绑定窗口，已打开时聚焦而不是新建。 */
  open(record, moduleId) {
    const binding = record.bindings.get(moduleId)
    if (!binding)
      throw new Error(`游戏模块 ${moduleId} 没有绑定。`)

    const existing = record.windows.get(moduleId)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return true
    }

    const window = new BrowserWindow({
      width: 960,
      height: 760,
      title: binding.title,
      autoHideMenuBar: true,
      backgroundColor: '#111111',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    window.on('closed', () => record.windows.delete(moduleId))
    record.windows.set(moduleId, window)

    window.loadURL(this.resolveWidgetUrl(record, binding)).catch((error) => {
      record.logs.push({
        at: Date.now(),
        level: 'error',
        message: `游戏窗口加载失败：${errorText(error)}`,
      })
    })

    return true
  }

  close(record, moduleId) {
    const window = record.windows.get(moduleId)
    if (window && !window.isDestroyed())
      window.destroy()
    record.windows.delete(moduleId)
    return true
  }

  isOpen(record, moduleId) {
    const window = record.windows.get(moduleId)
    return Boolean(window && !window.isDestroyed())
  }

  closeAll(record) {
    for (const window of record.windows.values()) {
      if (!window.isDestroyed())
        window.destroy()
    }
    record.windows.clear()
  }

  /** 处理 `plugin-assets://` 请求，只提供插件目录内的文件。 */
  async assetResponse(records, request) {
    let url
    try {
      url = new URL(request.url)
    }
    catch {
      return new Response('Bad request', { status: 400 })
    }

    const record = records.get(decodeURIComponent(url.hostname))
    if (!record)
      return new Response('Unknown plugin', { status: 404 })

    const file = resolveInside(record.dir, decodeURIComponent(url.pathname).replace(/^\/+/, ''))
    if (!file)
      return new Response('Not found', { status: 404 })

    try {
      if (!(await fsp.stat(file)).isFile())
        return new Response('Not found', { status: 404 })
    }
    catch {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(file).toString())
  }
}

module.exports = { GameletService, SCHEME, registerPluginScheme }

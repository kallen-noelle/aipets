/**
 * 本地插件宿主。
 *
 * 插件是一个带 `extension.aipets.json` 清单的文件夹，入口是 ESM 模块。
 * 宿主把文件夹安装到用户数据目录，负责启停、移除、日志与游戏窗口。
 */

const fsp = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const { protocol } = require('electron')

const { GameletService, SCHEME } = require('./gamelet.cjs')
const { createContext } = require('./kit.cjs')
const {
  createDisposableStore,
  errorText,
  findManifestRoot,
  readManifest,
} = require('./manifest.cjs')

const MAX_LOG_ENTRIES = 80

function emptyRecord(manifest, dir, error = null) {
  return {
    dir,
    manifest,
    extension: null,
    bindings: new Map(),
    windows: new Map(),
    moduleSubscriptions: new Map(),
    subscriptions: null,
    logs: [],
    error,
  }
}

class PluginHost {
  constructor({ rootDir, stateFile }) {
    this.rootDir = rootDir
    this.stateFile = stateFile
    this.state = { plugins: {} }
    this.records = new Map()
    this.sessionCounter = 0
    this.gamelets = new GameletService()
  }

  async initialize() {
    await fsp.mkdir(this.rootDir, { recursive: true })
    await this.loadState()
    await this.scanInstalled()

    protocol.handle(SCHEME, request => this.gamelets.assetResponse(this.records, request))

    for (const record of this.records.values()) {
      if (this.isEnabled(record.manifest.id))
        await this.activate(record.manifest.id)
    }
  }

  async loadState() {
    try {
      const parsed = JSON.parse(await fsp.readFile(this.stateFile, 'utf8'))
      if (parsed && typeof parsed === 'object' && parsed.plugins && typeof parsed.plugins === 'object')
        this.state = { plugins: parsed.plugins }
    }
    catch {
      this.state = { plugins: {} }
    }
  }

  async saveState() {
    await fsp.writeFile(this.stateFile, JSON.stringify(this.state, null, 2))
  }

  isEnabled(id) {
    return this.state.plugins[id]?.enabled === true
  }

  async scanInstalled() {
    let entries = []
    try {
      entries = await fsp.readdir(this.rootDir, { withFileTypes: true })
    }
    catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const dir = path.join(this.rootDir, entry.name)
      try {
        const manifest = await readManifest(path.join(dir, 'extension.aipets.json'))
        this.records.set(manifest.id, emptyRecord(manifest, dir))
      }
      catch (error) {
        this.records.set(entry.name, emptyRecord(
          { id: entry.name, version: '0.0.0', entrypoints: {} },
          dir,
          errorText(error),
        ))
      }
    }
  }

  list() {
    return [...this.records.values()].map(record => ({
      id: record.manifest.id,
      name: record.manifest.name ?? record.manifest.id,
      version: record.manifest.version ?? '0.0.0',
      description: record.manifest.description ?? '',
      enabled: this.isEnabled(record.manifest.id),
      loaded: record.extension !== null,
      error: record.error,
      bindings: [...record.bindings.values()].map(binding => ({
        moduleId: binding.moduleId,
        title: binding.title,
      })),
      logs: record.logs.slice(-20),
    }))
  }

  log(id, level, message) {
    const record = this.records.get(id)
    if (!record)
      return

    record.logs.push({ at: Date.now(), level, message })
    if (record.logs.length > MAX_LOG_ENTRIES)
      record.logs.splice(0, record.logs.length - MAX_LOG_ENTRIES)
  }

  async install(sourceDir) {
    const root = await findManifestRoot(sourceDir)
    const manifest = await readManifest(path.join(root, 'extension.aipets.json'))

    if (this.records.has(manifest.id))
      throw new Error(`插件 ${manifest.id} 已经安装。`)

    const destination = path.join(this.rootDir, manifest.id)
    await fsp.cp(root, destination, { recursive: true })

    this.records.set(manifest.id, emptyRecord(manifest, destination))
    this.state.plugins[manifest.id] = { enabled: false }
    await this.saveState()
    this.log(manifest.id, 'info', '已从本地文件夹安装。')
    return this.list()
  }

  async setEnabled(id, enabled) {
    const record = this.records.get(id)
    if (!record)
      throw new Error(`插件 ${id} 没有安装。`)

    if (enabled)
      await this.activate(id)
    else
      this.deactivate(id)

    this.state.plugins[id] = { enabled: Boolean(enabled) && record.extension !== null }
    await this.saveState()
    return this.list()
  }

  async activate(id) {
    const record = this.records.get(id)
    if (!record)
      throw new Error(`插件 ${id} 没有安装。`)
    if (record.extension)
      return

    record.error = null
    const entry = path.resolve(record.dir, `.${path.sep}${record.manifest.entrypoints.electron ?? ''}`)
    if (!entry.startsWith(`${record.dir}${path.sep}`)) {
      record.error = '入口路径越出了插件目录。'
      throw new Error(record.error)
    }

    const sessionId = `${id}:${++this.sessionCounter}`
    this.log(id, 'info', `正在加载 ${path.basename(entry)}。`)

    try {
      const loaded = await import(`${pathToFileURL(entry).href}?session=${this.sessionCounter}`)
      const extension = loaded.default ?? loaded.extension

      if (!extension || typeof extension.setup !== 'function')
        throw new Error('入口没有导出带 setup 函数的插件。')
      if (extension.id !== id)
        throw new Error(`入口 id ${extension.id} 与目录 ${id} 不一致。`)

      record.subscriptions = createDisposableStore()
      await extension.setup(createContext(record, sessionId, record.subscriptions, this.gamelets))
      record.extension = extension
      this.log(id, 'info', '插件已启用。')
    }
    catch (error) {
      record.error = errorText(error)
      record.subscriptions?.dispose()
      record.subscriptions = null
      record.bindings.clear()
      this.log(id, 'error', record.error)
      throw error
    }
  }

  deactivate(id) {
    const record = this.records.get(id)
    if (!record)
      return

    record.subscriptions?.dispose()
    record.subscriptions = null

    for (const subscriptions of record.moduleSubscriptions.values())
      subscriptions.dispose()
    record.moduleSubscriptions.clear()

    this.gamelets.closeAll(record)
    record.bindings.clear()
    record.extension = null
    this.log(id, 'info', '插件已停用。')
  }

  async remove(id) {
    const record = this.records.get(id)
    if (!record)
      throw new Error(`插件 ${id} 没有安装。`)

    this.deactivate(id)
    this.records.delete(id)
    delete this.state.plugins[id]
    await this.saveState()
    await fsp.rm(record.dir, { recursive: true, force: true })
    return this.list()
  }

  openBinding(id, moduleId) {
    const record = this.records.get(id)
    if (!record)
      throw new Error(`插件 ${id} 没有安装。`)
    return this.gamelets.open(record, moduleId)
  }

  closeBinding(id, moduleId) {
    const record = this.records.get(id)
    if (!record)
      return false
    return this.gamelets.close(record, moduleId)
  }

  dispose() {
    for (const id of this.records.keys())
      this.deactivate(id)
  }
}

module.exports = { PluginHost }

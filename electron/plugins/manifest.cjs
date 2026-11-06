/**
 * 插件清单的读取与路径安全。
 *
 * 插件是一个本地文件夹，根目录或 `dist/` 里放 `extension.aipets.json`。
 */

const fsp = require('node:fs/promises')
const path = require('node:path')

const MANIFEST_FILE = 'extension.aipets.json'
const MANIFEST_KIND = 'manifest.extension.aipets.app'
const MANIFEST_VERSION = 2

/** 主进程没有 ESM 的 errorMessageFrom，统一在这里转成文本。 */
function errorText(error) {
  if (error instanceof Error)
    return error.message
  return String(error)
}

/** 把相对路径解析到目录内，越界时返回 null。 */
function resolveInside(root, relative) {
  if (typeof relative !== 'string' || relative === '')
    return null

  const file = path.resolve(root, `.${path.sep}${relative}`)
  if (file !== root && !file.startsWith(`${root}${path.sep}`))
    return null
  return file
}

/** 读取并校验清单，字段缺失时把全部问题一次报出。 */
function readManifest(manifestFile) {
  return fsp.readFile(manifestFile, 'utf8').then((raw) => {
    const manifest = JSON.parse(raw)
    const problems = []

    if (!manifest || typeof manifest !== 'object')
      throw new Error('清单不是对象。')

    if (manifest.manifestVersion !== MANIFEST_VERSION)
      problems.push(`manifestVersion 必须是 ${MANIFEST_VERSION}。`)

    if (typeof manifest.id !== 'string' || !/^[\w.-]+$/.test(manifest.id))
      problems.push('id 只能包含字母、数字、点、短横线和下划线。')

    if (typeof manifest.version !== 'string' || manifest.version === '')
      problems.push('缺少 version。')

    if (manifest.kind !== MANIFEST_KIND)
      problems.push(`kind 必须是 ${MANIFEST_KIND}。`)

    if (typeof manifest.entrypoints?.electron !== 'string' || manifest.entrypoints.electron === '')
      problems.push('缺少 entrypoints.electron。')

    if (problems.length)
      throw new Error(problems.join(' '))

    return manifest
  })
}

/** 找到清单所在目录。仓库里的插件常放在 `dist/`。 */
async function findManifestRoot(sourceDir) {
  const direct = path.join(sourceDir, MANIFEST_FILE)
  try {
    if ((await fsp.stat(direct)).isFile())
      return sourceDir
  }
  catch {}

  const nested = path.join(sourceDir, 'dist', MANIFEST_FILE)
  try {
    if ((await fsp.stat(nested)).isFile())
      return path.join(sourceDir, 'dist')
  }
  catch {}

  throw new Error(`这个文件夹和它的 dist 目录里都没有 ${MANIFEST_FILE}。`)
}

/** 收集 `setup` 注册的清理函数。 */
function createDisposableStore() {
  const items = new Set()

  return {
    add(disposable) {
      const item = typeof disposable === 'function' ? { dispose: disposable } : disposable
      if (!item || typeof item.dispose !== 'function')
        return { dispose() {} }

      items.add(item)
      return {
        dispose() {
          if (items.delete(item))
            item.dispose()
        },
      }
    },
    dispose() {
      for (const item of items)
        item.dispose()
      items.clear()
    },
  }
}

module.exports = {
  MANIFEST_FILE,
  createDisposableStore,
  errorText,
  findManifestRoot,
  readManifest,
  resolveInside,
}

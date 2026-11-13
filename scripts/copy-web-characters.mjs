/**
 * 网页静态部署：把角色素材复制到 out/characters。
 *
 * 只复制运行时需要的 `characters.config.json` 与每个角色的 `animations/*.webm`，
 * 跳过 mp4、memes、动作提示词等非运行时文件。
 *
 * Electron 打包不调用本脚本，素材仍由 electron-builder 的 extraResources 提供，
 * 避免 out 被重复打包进 app.asar。
 */

import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'assets', 'characters')
const target = join(root, 'out', 'characters')

if (!existsSync(join(root, 'out', 'index.html')))
  throw new Error('out/index.html 不存在，请先运行 npm run build')

const configFile = join(source, 'characters.config.json')
if (!existsSync(configFile))
  throw new Error(`找不到角色索引：${configFile}`)

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
copyFileSync(configFile, join(target, 'characters.config.json'))

let files = 1
let bytes = statSync(configFile).size
let hardlinks = 0
let copied = 0
const skipped = []

/**
 * 优先硬链接，避免在 /dev/shm 构建环境里把 660MB 素材复制第二份。
 * 跨文件系统或平台不支持硬链接时退回普通复制。
 */
function placeFile(from, to) {
  try {
    linkSync(from, to)
    hardlinks += 1
  }
  catch {
    copyFileSync(from, to)
    copied += 1
  }
}

for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (!entry.isDirectory())
    continue

  const animations = join(source, entry.name, 'animations')
  if (!existsSync(animations))
    continue

  const destination = join(target, entry.name, 'animations')
  mkdirSync(destination, { recursive: true })

  for (const file of readdirSync(animations)) {
    if (!file.toLowerCase().endsWith('.webm')) {
      skipped.push(`${entry.name}/animations/${file}`)
      continue
    }

    const from = join(animations, file)
    if (!statSync(from).isFile())
      continue

    placeFile(from, join(destination, file))
    files += 1
    bytes += statSync(from).size
  }
}

console.log(
  `已复制 ${files} 个文件 / ${(bytes / 1024 / 1024).toFixed(1)} MB 到 out/characters`
  + `（硬链接 ${hardlinks}，普通复制 ${copied}）`,
)
if (skipped.length > 0)
  console.log(`跳过 ${skipped.length} 个非 webm 文件（mp4、提示词等）`)

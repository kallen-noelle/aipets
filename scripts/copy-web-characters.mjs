/**
 * 网页静态部署：按白名单把角色素材复制到 dist/characters。
 *
 * 默认上线 main 与 character5；可通过 AIPETS_WEB_CHARACTERS 环境变量指定角色 id，
 * 例如 AIPETS_WEB_CHARACTERS=character5,character6。
 * 索引也会同步裁剪，部署端不会加载未上线角色的配置。
 *
 * 只复制运行时需要的 `characters.config.json` 与每个角色的 `animations/*.webm`，
 * 跳过 mp4、memes、动作提示词等非运行时文件。
 *
 * Electron 打包不调用本脚本，素材仍由 electron-builder 的 extraResources 提供，
 * 避免 dist 被重复打包进 app.asar。
 */

import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'assets', 'characters')
const target = join(root, 'dist', 'characters')

if (!existsSync(join(root, 'dist', 'index.html')))
  throw new Error('dist/index.html 不存在，请先运行 npm run build')

const configFile = join(source, 'characters.config.json')
if (!existsSync(configFile))
  throw new Error(`找不到角色索引：${configFile}`)

const webCharacterIds = (process.env.AIPETS_WEB_CHARACTERS ?? 'main,character5')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean)

if (webCharacterIds.length === 0)
  throw new Error('AIPETS_WEB_CHARACTERS 不能为空')

const catalog = JSON.parse(readFileSync(configFile, 'utf8'))
const characters = catalog.characters.filter(item => webCharacterIds.includes(item.id))
const missing = webCharacterIds.filter(id => !characters.some(item => item.id === id))
if (missing.length > 0)
  throw new Error(`角色索引中不存在：${missing.join(', ')}`)

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
writeFileSync(
  join(target, 'characters.config.json'),
  `${JSON.stringify({ ...catalog, characters }, null, 2)}\n`,
)

let files = 1
let bytes = statSync(configFile).size
let hardlinks = 0
let copied = 0
const skipped = []

/**
 * 优先硬链接，避免在 /dev/shm 构建环境里把素材复制第二份。
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

for (const character of characters) {
  const animations = join(source, character.id, 'animations')
  if (!existsSync(animations))
    throw new Error(`角色缺少 animations 目录：${character.id}`)

  const destination = join(target, character.id, 'animations')
  mkdirSync(destination, { recursive: true })

  for (const file of readdirSync(animations)) {
    if (!file.toLowerCase().endsWith('.webm')) {
      skipped.push(`${character.id}/animations/${file}`)
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
  `已复制 ${characters.length} 个角色 / ${files} 个文件 / ${(bytes / 1024 / 1024).toFixed(1)} MB 到 dist/characters`
  + `（硬链接 ${hardlinks}，普通复制 ${copied}）`,
)
console.log(`上线角色：${characters.map(item => `${item.id} ${item.name}`).join('、')}`)
if (skipped.length > 0)
  console.log(`跳过 ${skipped.length} 个非 webm 文件（mp4、提示词等）`)

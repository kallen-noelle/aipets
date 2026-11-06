/**
 * 从原工程的角色资源生成新工程的索引。
 *
 * 源目录：原项目 `apps/stage-web-react/dist/character-assets`（可用
 * `AIPETS_CHARACTER_SOURCE` 覆盖）。
 * 目标目录：`assets/characters`。
 *
 * 只生成 `characters.config.json` 并复制 `animations/`，不复制原项目的
 * manifest 与物理配置。新工程的状态划分见 `src/character/types.ts`。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const sourceRoot = process.env.AIPETS_CHARACTER_SOURCE
  ?? path.resolve(scriptDir, '../../apps/stage-web-react/dist/character-assets')
const targetRoot = path.resolve(scriptDir, '../assets/characters')

/** 待机可复用的动作名关键词。 */
const AMBIENT_KEYWORDS = ['待机', '观察', '观望', '东张西望', '摇摆', '翻书', '回头望', '漂浮', '奔跑']

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function exists(file) {
  return fs.existsSync(file)
}

/** 把 manifest 里的片段声明统一成 `segments`。 */
function clipOf(entry, patch = {}) {
  // 三段式动作没有 loop 字段，`entry.loop` 是中间段对象。
  const sequence = Boolean(entry.start)
  const segments = sequence
    ? [entry.start, entry.loop, entry.end].filter(Boolean).map(part => part.src)
    : entry.src
      ? [entry.src]
      : []

  return {
    segments,
    weight: entry.weight ?? 1,
    loop: sequence ? false : (entry.loop ?? false),
    ...(entry.tags ? { tags: entry.tags } : {}),
    ...patch,
  }
}

function clipsOf(entries, patch) {
  return (entries ?? []).map(entry => clipOf(entry, patch))
}

/** 动作池：actions 与 longActions 合并，同名时长动作优先保留完整三段。 */
function actionsOf(animations) {
  const merged = new Map()

  for (const [name, entry] of Object.entries(animations.actions ?? {}))
    merged.set(name, clipOf(entry))
  for (const [name, entry] of Object.entries(animations.longActions ?? {}))
    merged.set(name, clipOf(entry))

  return [...merged.values()]
}

/** 情绪池：原索引按 mood 分组，这里保留 mood 作为标签。 */
function emotionsOf(animations) {
  const clips = []
  for (const [mood, entries] of Object.entries(animations.emotion ?? {})) {
    for (const entry of entries ?? [])
      clips.push(clipOf(entry, { tags: [mood] }))
  }

  return clips
}

/** 待机片段：原 idle 加上可循环的动作，避免只有一段可播。 */
function idleOf(animations) {
  const base = clipsOf(animations.idle, { loop: true })
  if (base.length === 0)
    throw new Error('角色缺少 idle 片段')

  const ambient = []
  for (const [name, entry] of Object.entries(animations.actions ?? {})) {
    if (!AMBIENT_KEYWORDS.some(keyword => name.includes(keyword)))
      continue
    if (base.some(clip => clip.segments.join('|') === (entry.src ?? '')))
      continue

    ambient.push(clipOf(entry, { loop: true }))
  }

  return [...base, ...ambient]
}

/** 说话片段：原 talk；没有 talk 的角色退回 thinking，保证进入 speaking 时有画面。 */
function speakingOf(animations) {
  const talk = clipsOf(animations.talk, { loop: true })
  if (talk.length > 0)
    return talk

  const thinking = clipsOf(animations.thinking, { loop: true })
  if (thinking.length > 0)
    return thinking

  return []
}

/** 拖拽片段：优先找名字带“拖拽”的动作，找不到就沿用 thinking。 */
function draggingOf(animations) {
  for (const [name, entry] of Object.entries(animations.actions ?? {})) {
    if (name.includes('拖拽'))
      return [clipOf(entry, { loop: true })]
  }

  const thinking = clipsOf(animations.thinking, { loop: true })
  if (thinking.length > 0)
    return thinking

  return []
}

/** 丢掉指向不存在文件的偏移量，避免播放器反复尝试坏路径。 */
function cleanClips(clips, files) {
  return clips
    .map(clip => ({
      ...clip,
      segments: clip.segments.filter(segment => files.has(segment.replace(/^animations\//, ''))),
    }))
    .filter(clip => clip.segments.length > 0)
}

/** 所有未被索引引用的文件都补回索引，待机类名字进 idle，其余进动作池。 */
function appendLeftovers(character, files) {
  const referenced = new Set()
  for (const clips of [...Object.values(character.states).flat(), ...Object.values(character.pools).flat()])
    for (const segment of clips.segments)
      referenced.add(segment.replace(/^animations\//, ''))

  for (const file of files) {
    if (referenced.has(file))
      continue

    const segments = [`animations/${file}`]
    if (AMBIENT_KEYWORDS.some(keyword => file.includes(keyword)))
      character.states.idle.push({ segments, weight: 1, loop: true })
    else
      character.pools.actions.push({ segments, weight: 1, loop: false })
  }
}

/** 去掉文件名前缀，保留长动作的 -start / -loop / -end 后缀。 */
function normalizeName(file) {
  const ext = path.extname(file)
  let stem = file.slice(0, file.length - ext.length).trimEnd()
  const match = /-((?:start|loop|end))$/.exec(stem)
  const suffix = match ? `-${match[1]}` : ''
  const base = suffix ? stem.slice(0, stem.length - suffix.length) : stem
  const dash = base.indexOf('-')
  const core = dash > 0 ? base.slice(dash + 1) : base
  return `${core.trimEnd()}${suffix}${ext}`
}

/**
 * 复制后的动画目录去前缀，并同步索引里的片段路径。
 *
 * 原资源用“点击回应-开心跃动”这类文件名，展示名与文件名重复。这里统一
 * 去掉第一段前缀，后缀保留，保证模型与提示词看到的名字干净。
 */
function normalizeAnimations(character) {
  const dir = path.join(targetRoot, character.id, 'animations')
  const files = fs.readdirSync(dir)
  const targets = new Map()
  const moves = []

  for (const file of files) {
    const next = normalizeName(file)
    if (targets.has(next))
      throw new Error(`重命名冲突：${character.id} ${targets.get(next)} 与 ${file} 都会变成 ${next}`)
    targets.set(next, file)
    if (file !== next)
      moves.push([file, next])
  }

  for (const [from] of moves)
    fs.renameSync(path.join(dir, from), path.join(dir, `__normalize__${from}`))
  for (const [from, to] of moves) {
    fs.renameSync(path.join(dir, `__normalize__${from}`), path.join(dir, to))
    console.log(`${character.id}: ${from} -> ${to}`)
  }

  const fileSet = new Set(targets.keys())
  for (const list of [...Object.values(character.states), ...Object.values(character.pools)]) {
    for (const clip of list) {
      clip.segments = clip.segments.map((segment) => {
        const prefix = 'animations/'
        if (!segment.startsWith(prefix))
          return segment
        return prefix + normalizeName(segment.slice(prefix.length))
      })
    }
  }

  for (const state of Object.keys(character.states))
    character.states[state] = cleanClips(character.states[state], fileSet)
  for (const pool of Object.keys(character.pools))
    character.pools[pool] = cleanClips(character.pools[pool], fileSet)
}

function buildCharacter(indexEntry, directory, files) {
  const fileSet = new Set(files)
  const characterJson = exists(path.join(directory, 'character.json'))
    ? readJson(path.join(directory, 'character.json'))
    : {}
  const manifest = readJson(path.join(directory, 'manifest.json'))
  const personaJson = exists(path.join(directory, '人设.json'))
    ? readJson(path.join(directory, '人设.json'))
    : {}

  const animations = manifest.animations ?? {}

  const character = {
    id: indexEntry.id,
    name: characterJson.name ?? indexEntry.name ?? indexEntry.id,
    roman: characterJson.roman ?? indexEntry.roman ?? '',
    role: characterJson.role ?? indexEntry.role ?? '',
    description: characterJson.description ?? indexEntry.description ?? '',
    accent: characterJson.accent ?? indexEntry.accent ?? '#7dd3fc',
    order: characterJson.order ?? indexEntry.order ?? 0,
    canvas: manifest.canvas ?? { width: 640, height: 360 },
    fadeMs: manifest.transition?.fadeMs ?? 180,
    persona: personaJson.whisperPrompt ?? indexEntry.persona ?? '',
    states: {
      idle: idleOf(animations),
      speaking: speakingOf(animations),
      thinking: clipsOf(animations.thinking, { loop: true }),
      petted: clipsOf(animations.click, { loop: false }),
      dragging: draggingOf(animations),
    },
    pools: {
      emotion: emotionsOf(animations),
      actions: actionsOf(animations),
    },
  }

  for (const state of Object.keys(character.states))
    character.states[state] = cleanClips(character.states[state], fileSet)
  for (const pool of Object.keys(character.pools))
    character.pools[pool] = cleanClips(character.pools[pool], fileSet)

  if (character.states.idle.length === 0)
    throw new Error(`角色缺少可用的 idle 片段：${character.id}`)

  appendLeftovers(character, files)
  if (character.states.speaking.length === 0)
    character.states.speaking = character.states.idle.map(clip => ({ ...clip, loop: true }))
  return character
}

/** 清空目标动画目录后复制，避免旧文件残留。 */
function copyAnimations(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })
}

function main() {
  if (!exists(sourceRoot))
    throw new Error(`找不到角色资源目录：${sourceRoot}`)

  const index = readJson(path.join(sourceRoot, 'characters.json'))
  const characters = index
    .map(entry => entry.id)
    .map((id) => {
      const directory = path.join(sourceRoot, id)
      const animationsDir = path.join(directory, 'animations')
      if (!exists(path.join(directory, 'manifest.json')))
        throw new Error(`角色缺少 manifest.json：${id}`)
      if (!exists(animationsDir))
        throw new Error(`角色缺少 animations 目录：${id}`)

      // 资源已复制过时可用 AIPETS_SKIP_COPY=1 只重建索引。
      if (process.env.AIPETS_SKIP_COPY !== '1')
        copyAnimations(animationsDir, path.join(targetRoot, id, 'animations'))

      const files = fs.readdirSync(animationsDir)
      const character = buildCharacter(index.find(item => item.id === id), directory, files)
      normalizeAnimations(character)
      return character
    })
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))

  const catalog = { schemaVersion: 1, characters }
  fs.mkdirSync(targetRoot, { recursive: true })
  fs.writeFileSync(path.join(targetRoot, 'characters.config.json'), `${JSON.stringify(catalog, null, 2)}\n`)

  for (const character of characters) {
    const groups = [...Object.values(character.states).flat(), ...Object.values(character.pools).flat()]
    const files = groups.reduce((sum, clip) => sum + clip.segments.length, 0)
    console.log(`${character.id} ${character.name}：${groups.length} 组 / ${files} 个文件`)
  }
}

main()

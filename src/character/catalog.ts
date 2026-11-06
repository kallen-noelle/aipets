/**
 * 资源索引的解析与加载。
 *
 * `characters.config.json` 是资源集中管理的唯一入口：换角色或增删片段只改
 * 资源目录与这份索引，不改代码。解析用 zod 约束结构，索引损坏时给出明确
 * 的错误信息而不是让播放器黑屏。
 */

import { z } from 'zod'

import type {
  CharacterClip,
  CharacterDefinition,
  CharacterPoolName,
  CharacterStateName,
  CharactersCatalog,
} from './types'

/**
 * 当前环境的资源基地址。
 *
 * 打包后的桌面外壳从 file:// 打开页面，Chromium 不允许 fetch 自定义协议，
 * 由主进程的本地 HTTP 服务提供资源；开发服务器与浏览器预览使用 Vite 的
 * `/characters`，与资源目录结构一致。
 */
export function resolveAssetBase(): string {
  const packaged = typeof window !== 'undefined'
    && Boolean(window.aipetsDesktop)
    && window.location.protocol === 'file:'
  return packaged && window.aipetsDesktop?.resourceBase
    ? window.aipetsDesktop.resourceBase
    : '/characters'
}

/**
 * 索引里的片段声明。
 *
 * 单个文件写 `src`，多段演出写 `segments`，两者取其一。
 */
const rawClipSchema = z.object({
  src: z.string().min(1).optional(),
  segments: z.array(z.string().min(1)).min(1).optional(),
  weight: z.number().positive().default(1),
  loop: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
})

const characterSchema = z.object({
  id: z.string().min(1, '角色 id 不能为空'),
  name: z.string().min(1, '角色名不能为空'),
  roman: z.string().default(''),
  role: z.string().default(''),
  description: z.string().default(''),
  accent: z.string().default('#7dd3fc'),
  order: z.number().default(0),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  fadeMs: z.number().nonnegative().default(180),
  persona: z.string().default(''),
  states: z.object({
    idle: z.array(rawClipSchema).min(1, 'idle 状态至少需要一个片段'),
    speaking: z.array(rawClipSchema).default([]),
    thinking: z.array(rawClipSchema).default([]),
    petted: z.array(rawClipSchema).default([]),
    dragging: z.array(rawClipSchema).default([]),
  }),
  pools: z.object({
    emotion: z.array(rawClipSchema).default([]),
    actions: z.array(rawClipSchema).default([]),
  }).default({ emotion: [], actions: [] }),
})

const catalogSchema = z.object({
  schemaVersion: z.number(),
  characters: z.array(characterSchema).min(1, '索引中必须至少有一个角色'),
})

type RawClip = z.infer<typeof rawClipSchema>

/** 把 `src` 或 `segments` 归一为统一的片段结构。 */
function normalizeClip(raw: RawClip): CharacterClip {
  const segments = raw.segments ?? (raw.src ? [raw.src] : [])
  if (segments.length === 0)
    throw new Error('片段缺少 src 或 segments')

  return {
    segments,
    weight: raw.weight,
    loop: raw.loop,
    ...(raw.tags.length > 0 ? { tags: raw.tags } : {}),
  }
}

function normalizeClips(clips: RawClip[]): CharacterClip[] {
  return clips.map(normalizeClip)
}

/** 解析索引数据，损坏时抛出带原因的错误。 */
export function parseCharactersCatalog(data: unknown): CharactersCatalog {
  const result = catalogSchema.safeParse(data)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue.path.length > 0 ? issue.path.join('.') : '根节点'
    throw new Error(`资源索引损坏：${where} ${issue.message}`)
  }

  const parsed = result.data
  return {
    schemaVersion: parsed.schemaVersion,
    characters: parsed.characters
      .map(character => ({
        ...character,
        states: {
          idle: normalizeClips(character.states.idle),
          speaking: normalizeClips(character.states.speaking),
          thinking: normalizeClips(character.states.thinking),
          petted: normalizeClips(character.states.petted),
          dragging: normalizeClips(character.states.dragging),
        },
        pools: {
          emotion: normalizeClips(character.pools.emotion),
          actions: normalizeClips(character.pools.actions),
        },
      }))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
  }
}

/** 加载并解析资源索引。Electron 走协议，浏览器走 Vite 中间件。 */
export async function loadCharactersCatalog(base = resolveAssetBase()): Promise<CharactersCatalog> {
  const response = await fetch(`${base}/characters.config.json`)
  if (!response.ok)
    throw new Error(`资源索引加载失败：HTTP ${response.status}`)

  return parseCharactersCatalog(await response.json())
}

/**
 * 取角色。指定 id 不存在时回退到索引里的第一个角色，避免旧配置把舞台变黑。
 * 索引为空时抛错。
 */
export function getCharacter(catalog: CharactersCatalog, id?: string): CharacterDefinition {
  const character = (id ? catalog.characters.find(candidate => candidate.id === id) : undefined)
    ?? catalog.characters[0]
  if (!character)
    throw new Error(`角色不存在：${id ?? '(未指定)'}`)

  return character
}

/** 取某个状态的片段清单，状态缺失时回退到 idle。 */
export function clipsForState(
  character: CharacterDefinition,
  state: CharacterStateName,
): CharacterClip[] {
  const clips = character.states[state]
  return clips.length > 0 ? clips : character.states.idle
}

/** 取播放池，池为空时返回空数组。 */
export function clipsForPool(
  character: CharacterDefinition,
  pool: CharacterPoolName,
): CharacterClip[] {
  return character.pools[pool]
}

/**
 * 把角色内的相对路径转成资源 URL。
 *
 * 中文文件名逐段编码，分隔符保持原样。基地址由运行环境决定，
 * 见 `resolveAssetBase`。
 */
export function clipUrl(characterId: string, src: string, base = resolveAssetBase()): string {
  const encoded = src.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return `${base}/${characterId}/${encoded}`
}

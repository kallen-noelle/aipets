/**
 * 表情包域：聊天里可以发送的图片与回复表情设置。
 *
 * 表情包只属于内置主角 `main`：其他角色不显示入口，也不参与发送逻辑。
 * 图片可以是远程地址，也可以是本地上传的 data URL；为了不撑爆
 * localStorage，最多保留 24 张。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

/** 表情包上限。 */
export const MAX_STICKERS = 24

/** 目前只有内置主角拥有表情包，判定依据是实例的 characterId。 */
export const STICKER_CHARACTER_ID = 'main'

/** 可用表情标签，角色据此挑选贴合语境的一张。 */
export const STICKER_TAGS = ['开心', '难过', '疑惑', '惊讶', '感谢', '喜欢', '庆祝', '生气', '疲惫'] as const

export type StickerTag = typeof STICKER_TAGS[number]

/** 频率档位，界面下拉直接使用这里的文案与数值。 */
export const STICKER_FREQUENCIES = [
  { value: 0.2, label: '低频（20%）' },
  { value: 0.5, label: '适中（50%）' },
  { value: 0.8, label: '高频（80%）' },
] as const

export interface Sticker {
  id: string
  name: string
  /** 远程地址，本地导入的图片为空。 */
  url: string
  /** 本地上传的 data URL。 */
  dataUrl?: string
  tags: StickerTag[]
}

/** 新增表情时传入的数据，标签可省略。 */
export interface StickerDraft {
  name: string
  url: string
  dataUrl?: string
  tags?: StickerTag[]
}

export interface StickersState {
  items: Sticker[]
  enabled: boolean
  /** 允许发送表情包的概率，取值 0–1。 */
  frequency: number
  /** 添加一张表情，库满时返回 false。 */
  add: (sticker: StickerDraft) => boolean
  /** 修改名称与标签，图片本身不在这里换。 */
  update: (id: string, patch: Partial<Pick<Sticker, 'name' | 'tags'>>) => void
  remove: (id: string) => void
  updateSettings: (patch: Partial<Pick<StickersState, 'enabled' | 'frequency'>>) => void
}

function normalizeTag(value: unknown): StickerTag | null {
  return STICKER_TAGS.includes(value as StickerTag) ? value as StickerTag : null
}

/** 归一化一条已存表情，旧数据缺标签时补空数组。 */
function normalizeSticker(value: unknown): Sticker | null {
  if (typeof value !== 'object' || value === null)
    return null

  const entry = value as Record<string, unknown>
  if (typeof entry.id !== 'string' || !entry.id)
    return null

  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  const url = typeof entry.url === 'string' ? entry.url : ''
  const dataUrl = typeof entry.dataUrl === 'string' && entry.dataUrl ? entry.dataUrl : undefined
  if (!name || (!url && !dataUrl))
    return null

  const tags = Array.isArray(entry.tags)
    ? entry.tags.map(normalizeTag).filter((tag): tag is StickerTag => tag !== null)
    : []

  return { id: entry.id, name, url, dataUrl, tags }
}

function normalizeFrequency(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0.5
}

/** 把任意已存快照收敛成当前结构，非法条目直接丢弃。 */
function normalizeStored(persisted: unknown): Partial<StickersState> {
  const saved = (persisted ?? {}) as Partial<StickersState>
  const items = Array.isArray(saved.items)
    ? saved.items.map(normalizeSticker).filter((item): item is Sticker => item !== null)
    : []

  return {
    items,
    enabled: saved.enabled !== false,
    frequency: normalizeFrequency(saved.frequency),
  }
}

function migrateStored(persisted: unknown): Partial<StickersState> {
  return normalizeStored(persisted)
}

function mergeStored(persisted: unknown, current: StickersState): StickersState {
  return { ...current, ...normalizeStored(persisted) }
}

export const useStickersStore = create<StickersState>()(
  persist(
    (set, get) => ({
      items: [],
      enabled: true,
      frequency: 0.5,
      add: (sticker) => {
        if (get().items.length >= MAX_STICKERS)
          return false

        set(state => ({
          items: [...state.items, {
            id: `sticker-${Date.now()}-${state.items.length}`,
            name: sticker.name,
            url: sticker.url,
            ...(sticker.dataUrl ? { dataUrl: sticker.dataUrl } : {}),
            tags: sticker.tags ?? [],
          }],
        }))
        return true
      },
      update: (id, patch) => set(state => ({
        items: state.items.map(item => item.id === id ? { ...item, ...patch } : item),
      })),
      remove: id => set(state => ({ items: state.items.filter(item => item.id !== id) })),
      updateSettings: patch => set(patch),
    }),
    persistOptions<StickersState, Partial<StickersState>>('stickers', 2, mergeStored, migrateStored),
  ),
)

/** 取一张表情的显示地址。 */
export function stickerSource(sticker: Sticker): string {
  return sticker.dataUrl || sticker.url
}

/** 某个角色是否拥有表情包能力。 */
export function hasStickers(characterId: string): boolean {
  return characterId === STICKER_CHARACTER_ID
}

/** 当前角色可用的表情；未启用或非主角时为空。 */
export function availableStickers(characterId: string): Sticker[] {
  if (!hasStickers(characterId))
    return []

  const { items, enabled } = useStickersStore.getState()
  return enabled ? items : []
}

/**
 * 本轮交给角色挑选的表情候选。
 *
 * 先按频率掷骰决定“允不允许发”，命中后由角色判断语境是否贴切。
 */
export function rollStickerCandidates(characterId: string): Sticker[] {
  const items = availableStickers(characterId)
  if (items.length === 0)
    return []

  const { frequency } = useStickersStore.getState()
  return Math.random() < frequency ? items : []
}

const STICKER_MARKER = /\[\[sticker:([^\]\n]{1,40})\]\]/g

/** 从回复里取出表情标记，返回去掉标记的正文与表情名。 */
export function takeStickerMarker(text: string): { text: string, name: string | null } {
  let name: string | null = null
  const stripped = text.replace(STICKER_MARKER, (_, value: string) => {
    name ??= value.trim()
    return ''
  })

  return { text: stripped.trim(), name }
}

/** 按名称取一张表情，名称不存在或角色不匹配时返回 null。 */
export function stickerByName(characterId: string, name: string): Sticker | null {
  if (!hasStickers(characterId))
    return null

  return useStickersStore.getState().items.find(item => item.name === name) ?? null
}

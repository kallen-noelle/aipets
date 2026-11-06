/**
 * 贴纸域：聊天里可以发送的图片与回复贴纸设置。
 *
 * 图片可以是远程地址，也可以是本地上传的 data URL。为了不撑爆
 * localStorage，最多保留 24 张。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

/** 贴纸库上限。 */
export const MAX_STICKERS = 24

export interface Sticker {
  id: string
  name: string
  url: string
  dataUrl?: string
}

interface StickersState {
  items: Sticker[]
  enabled: boolean
  /** 回复附带贴纸的概率。 */
  frequency: number
  /** 添加一张贴纸，库满时返回 false。 */
  add: (sticker: Omit<Sticker, 'id'>) => boolean
  remove: (id: string) => void
  updateSettings: (patch: Partial<Pick<StickersState, 'enabled' | 'frequency'>>) => void
}

export const useStickersStore = create<StickersState>()(
  persist(
    (set, get) => ({
      items: [],
      enabled: true,
      frequency: 0.2,
      add: (sticker) => {
        if (get().items.length >= MAX_STICKERS)
          return false

        set(state => ({
          items: [...state.items, { ...sticker, id: `sticker-${Date.now()}-${state.items.length}` }],
        }))
        return true
      },
      remove: id => set(state => ({ items: state.items.filter(item => item.id !== id) })),
      updateSettings: patch => set(patch),
    }),
    persistOptions<StickersState>('stickers'),
  ),
)

/** 取一张贴纸的显示地址。 */
export function stickerSource(sticker: Sticker): string {
  return sticker.dataUrl || sticker.url
}

/** 按概率挑一张贴纸，没有可用贴纸时返回 null。 */
export function pickSticker(): Sticker | null {
  const { items, enabled, frequency } = useStickersStore.getState()
  if (!enabled || items.length === 0 || Math.random() >= frequency)
    return null

  return items[Math.floor(Math.random() * items.length)]
}

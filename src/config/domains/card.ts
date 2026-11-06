/**
 * 角色卡域：覆盖资源索引里的名称与人设，并记录聊天偏好。
 *
 * 对齐原项目：名称与人设按角色共享，模型与历史轮数按实例隔离。
 * 索引里的角色是只读资源，这里的改动不动资源文件。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'
import { useCharacterStore } from './character'

export const cardOverrideSchema = z.object({
  name: z.string(),
  persona: z.string(),
  /** 空字符串表示沿用全局模型。 */
  model: z.string(),
  /** 发送给模型的历史消息条数，2 到 50。 */
  historyWindow: z.number().min(2).max(50),
})

export type CardOverride = z.infer<typeof cardOverrideSchema>

type ProfilePatch = Partial<Pick<CardOverride, 'name' | 'persona'>>
type ChatPatch = Partial<Pick<CardOverride, 'model' | 'historyWindow'>>

interface CardState {
  /** 角色资料，键是角色标识，全部实例共享。 */
  profiles: Record<string, ProfilePatch>
  /** 聊天偏好，键是实例标识。 */
  chats: Record<string, ChatPatch>
  updateProfile: (characterId: string, patch: ProfilePatch) => void
  updateChat: (instanceId: string, patch: ChatPatch) => void
  resetChat: (instanceId: string) => void
}

/**
 * 合并已存配置。
 *
 * 旧版本只有一个 records，键可能是角色或实例。迁移时拆分：
 * 名称与人设归角色，模型与轮数归实例。
 */
function mergeStored(persisted: unknown, current: CardState): CardState {
  const saved = (persisted ?? {}) as Partial<CardState> & {
    records?: Record<string, Partial<CardOverride>>
  }
  const instances = useCharacterStore.getState().instances
  const profiles: Record<string, ProfilePatch> = { ...saved.profiles }
  const chats: Record<string, ChatPatch> = { ...saved.chats }

  for (const [key, value] of Object.entries(saved.records ?? {})) {
    const instance = instances.find(item => item.id === key)
    const characterId = instance?.characterId ?? key

    if (typeof value.name === 'string' || typeof value.persona === 'string') {
      profiles[characterId] = {
        ...profiles[characterId],
        ...(typeof value.name === 'string' ? { name: value.name } : {}),
        ...(typeof value.persona === 'string' ? { persona: value.persona } : {}),
      }
    }

    const chatTarget = instance
      ?? instances.find(item => item.characterId === key)
    if (chatTarget && (typeof value.model === 'string' || typeof value.historyWindow === 'number')) {
      chats[chatTarget.id] = {
        ...chats[chatTarget.id],
        ...(typeof value.model === 'string' ? { model: value.model } : {}),
        ...(typeof value.historyWindow === 'number' ? { historyWindow: value.historyWindow } : {}),
      }
    }
  }

  return { ...current, profiles, chats }
}

export const useCardStore = create<CardState>()(
  persist(
    set => ({
      profiles: {},
      chats: {},
      updateProfile: (characterId, patch) => set(state => ({
        profiles: {
          ...state.profiles,
          [characterId]: { ...state.profiles[characterId], ...patch },
        },
      })),
      updateChat: (instanceId, patch) => set(state => ({
        chats: {
          ...state.chats,
          [instanceId]: { ...state.chats[instanceId], ...patch },
        },
      })),
      resetChat: instanceId => set((state) => {
        const chats = { ...state.chats }
        delete chats[instanceId]
        return { chats }
      }),
    }),
    persistOptions<CardState>('card', 1, mergeStored),
  ),
)

/** 合并角色资料与实例聊天设置；未设置时返回空对象。 */
export function cardOverride(characterId: string, instanceId: string): Partial<CardOverride> {
  const { profiles, chats } = useCardStore.getState()
  return { ...profiles[characterId], ...chats[instanceId] }
}

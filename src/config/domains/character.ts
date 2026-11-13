/**
 * 角色域：角色实例与导演节奏。
 *
 * 对齐原项目：实例自带外观（缩放、淡入、镜像、响应点击）与启用标记，
 * 舞台按启用列表平铺显示。实例列表顺序同时决定叠放层级。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'
import { useMemoryStore } from './memory'

export const instanceAppearanceSchema = z.object({
  scale: z.number().min(0.4).max(3),
  /** 交叉淡入时长，毫秒。 */
  fadeMs: z.number().min(0).max(1200),
  /** 水平镜像。 */
  mirror: z.boolean(),
  /** 点击角色是否触发被摸动作。 */
  clickEnabled: z.boolean(),
})

export type InstanceAppearance = z.infer<typeof instanceAppearanceSchema>

export const defaultInstanceAppearance: InstanceAppearance = {
  scale: 1,
  fadeMs: 180,
  mirror: false,
  clickEnabled: true,
}

export const characterInstanceSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1),
  appearance: instanceAppearanceSchema,
  /** 是否在舞台和桌面上显示。 */
  enabled: z.boolean(),
})

export type CharacterInstance = z.infer<typeof characterInstanceSchema>

export const characterConfigSchema = z.object({
  /** 待机片段轮换的最短与最长间隔，毫秒。 */
  idleIntervalMs: z.tuple([z.number().min(2000), z.number().min(2000)]),
  /** 空闲时插入情绪或长动作的概率。 */
  poolChance: z.number().min(0).max(1),
})

export type CharacterConfig = z.infer<typeof characterConfigSchema>

interface CharacterState extends CharacterConfig {
  instances: CharacterInstance[]
  /** 当前对话的实例。 */
  activeInstanceId: string
  update: (patch: Partial<CharacterConfig>) => void
  addInstance: (characterId: string) => string
  updateInstance: (id: string, patch: Partial<Omit<CharacterInstance, 'id'>>) => void
  removeInstance: (id: string) => void
  setActiveInstance: (id: string) => void
}

/** 旧版单角色配置迁移后使用的固定实例标识。 */
const LEGACY_INSTANCE_ID = 'instance-main'

function newInstanceId(): string {
  return `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 归一化一个已存实例，容忍旧字段与缺字段。 */
function normalizeInstance(value: unknown): CharacterInstance | null {
  if (typeof value !== 'object' || value === null)
    return null

  const entry = value as Record<string, unknown>
  if (typeof entry.id !== 'string' || !entry.id)
    return null
  if (typeof entry.characterId !== 'string' || !entry.characterId)
    return null

  const appearance = typeof entry.appearance === 'object' && entry.appearance !== null
    ? entry.appearance as Partial<InstanceAppearance>
    : {}

  return {
    id: entry.id,
    characterId: entry.characterId,
    appearance: {
      scale: typeof appearance.scale === 'number' ? appearance.scale : defaultInstanceAppearance.scale,
      fadeMs: typeof appearance.fadeMs === 'number' ? appearance.fadeMs : defaultInstanceAppearance.fadeMs,
      mirror: appearance.mirror === true,
      clickEnabled: appearance.clickEnabled !== false,
    },
    // 旧版字段名是 visible。
    enabled: entry.enabled !== false && entry.visible !== false,
  }
}

/**
 * 合并已存配置。
 *
 * 旧版本只有单个角色与全局外观，迁移成第一个实例。
 */
function mergeStored(persisted: unknown, current: CharacterState): CharacterState {
  const saved = (persisted ?? {}) as Partial<CharacterState> & {
    characterId?: string
    scale?: number
    fadeMs?: number
    mirror?: boolean
    respondToClicks?: boolean
  }

  const list = Array.isArray(saved.instances) ? saved.instances : []
  const instances = list
    .map(normalizeInstance)
    .filter((item): item is CharacterInstance => item !== null)

  const migrated = instances.length
    ? instances
    : [{
        id: LEGACY_INSTANCE_ID,
        characterId: saved.characterId ?? 'main',
        appearance: {
          scale: saved.scale ?? defaultInstanceAppearance.scale,
          fadeMs: saved.fadeMs ?? defaultInstanceAppearance.fadeMs,
          mirror: saved.mirror ?? defaultInstanceAppearance.mirror,
          clickEnabled: saved.respondToClicks ?? defaultInstanceAppearance.clickEnabled,
        },
        enabled: true,
      }]

  const activeInstanceId = migrated.some(item => item.id === saved.activeInstanceId)
    ? saved.activeInstanceId!
    : migrated[0].id

  return {
    ...current,
    idleIntervalMs: (saved.idleIntervalMs ?? current.idleIntervalMs) as [number, number],
    poolChance: saved.poolChance ?? current.poolChance,
    instances: migrated,
    activeInstanceId,
  }
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      instances: [{
        id: LEGACY_INSTANCE_ID,
        characterId: 'main',
        appearance: { ...defaultInstanceAppearance },
        enabled: true,
      }],
      activeInstanceId: LEGACY_INSTANCE_ID,
      idleIntervalMs: [8000, 16000] as [number, number],
      poolChance: 0.25,
      update: patch => set(patch),

      addInstance: (characterId) => {
        const id = newInstanceId()
        set(state => ({
          instances: [
            ...state.instances,
            {
              id,
              characterId,
              appearance: { ...defaultInstanceAppearance },
              enabled: true,
            },
          ],
          activeInstanceId: id,
        }))
        return id
      },

      updateInstance: (id, patch) => set(state => ({
        instances: state.instances.map(item => item.id === id ? { ...item, ...patch } : item),
      })),

      removeInstance: (id) => {
        // 至少保留一个实例，舞台不能完全空掉。
        if (get().instances.length <= 1)
          return

        set((state) => {
          const instances = state.instances.filter(item => item.id !== id)
          return {
            instances,
            activeInstanceId: state.activeInstanceId === id
              ? instances[0].id
              : state.activeInstanceId,
          }
        })

        // 实例的专属记忆随实例一起删除，避免留下无处可归的孤儿条目。
        useMemoryStore.getState().removeByInstance(id)
      },

      setActiveInstance: id => set(state => (
        state.instances.some(item => item.id === id) ? { activeInstanceId: id } : state
      )),
    }),
    persistOptions<CharacterState>('character', 1, mergeStored),
  ),
)

/** 当前实例，没有时退回第一个实例。 */
export function activeInstance(): CharacterInstance | null {
  const { instances, activeInstanceId } = useCharacterStore.getState()
  return instances.find(item => item.id === activeInstanceId) ?? instances[0] ?? null
}

/** 按标识取实例，找不到时返回当前实例。 */
export function instanceById(instanceId: string | null): CharacterInstance | null {
  if (!instanceId)
    return activeInstance()

  return useCharacterStore.getState().instances.find(item => item.id === instanceId)
    ?? activeInstance()
}

/** 实例在全部实例中的序号，从 1 开始。 */
export function instanceNumber(instances: CharacterInstance[], instance: CharacterInstance): number {
  return instances.findIndex(item => item.id === instance.id) + 1
}

/** 某个角色的全部实例，带序号。 */
export function instancesOfCharacter(
  instances: CharacterInstance[],
  characterId: string,
): { instance: CharacterInstance, number: number }[] {
  return instances
    .map((instance, index) => ({ instance, number: index + 1 }))
    .filter(entry => entry.instance.characterId === characterId)
}

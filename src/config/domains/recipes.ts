/**
 * 配方域：可复用的提示词模板。
 *
 * 所有已启用且已批准的配方都会追加到系统提示词。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const recipeSchema = z.object({
  name: z.string().min(1, '请填写名称'),
  description: z.string(),
  prompt: z.string().min(1, '请填写提示词'),
})

export type RecipeInput = z.infer<typeof recipeSchema>

export interface Recipe {
  id: string
  name: string
  description: string
  prompt: string
  /** 代码词，命中后可以快速指代这条配方。 */
  keywords: string[]
  /** 在后台执行，不打断当前话题。 */
  background: boolean
  source: 'user' | 'model'
  enabled: boolean
  approved: boolean
}

interface RecipesState {
  items: Recipe[]
  /** 允许角色在对话中提议新配方。 */
  proposalsEnabled: boolean
  add: (input: RecipeInput & { keywords: string[], background: boolean }) => void
  /** 角色提议的配方，必须等待批准才能启用。 */
  propose: (input: RecipeInput & { keywords: string[], background: boolean }) => void
  remove: (id: string) => void
  setEnabled: (id: string, enabled: boolean) => void
  approve: (id: string) => void
  setProposalsEnabled: (value: boolean) => void
}

/** 旧版本配方只有名称与提示词，补齐字段并默认启用。 */
function mergeStored(persisted: unknown, current: RecipesState): RecipesState {
  const saved = (persisted ?? {}) as Partial<RecipesState>
  const items = (saved.items ?? current.items).map(item => ({
    description: '',
    keywords: [],
    background: false,
    source: 'user' as const,
    enabled: true,
    approved: true,
    ...item,
  }))

  return {
    ...current,
    ...saved,
    items,
    proposalsEnabled: saved.proposalsEnabled ?? false,
  }
}

export const useRecipesStore = create<RecipesState>()(
  persist(
    set => ({
      items: [],
      proposalsEnabled: false,
      add: input => set(state => ({
        items: [...state.items, {
          id: `recipe-${Date.now()}`,
          name: input.name.trim(),
          description: input.description.trim(),
          prompt: input.prompt.trim(),
          keywords: input.keywords.filter(Boolean),
          background: input.background,
          source: 'user',
          enabled: true,
          approved: true,
        }],
      })),
      propose: input => set((state) => {
        // 未开启提议时不写入，避免角色绕过开关。
        if (!state.proposalsEnabled)
          return state

        return {
          items: [...state.items, {
            id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: input.name.trim(),
            description: input.description.trim(),
            prompt: input.prompt.trim(),
            keywords: input.keywords.filter(Boolean),
            background: input.background,
            source: 'model',
            enabled: false,
            approved: false,
          }],
        }
      }),
      remove: id => set(state => ({ items: state.items.filter(item => item.id !== id) })),
      setEnabled: (id, enabled) => set(state => ({
        items: state.items.map(item => item.id === id ? { ...item, enabled } : item),
      })),
      approve: id => set(state => ({
        items: state.items.map(item => item.id === id ? { ...item, approved: true, enabled: true } : item),
      })),
      setProposalsEnabled: proposalsEnabled => set({ proposalsEnabled }),
    }),
    persistOptions<RecipesState>('recipes', 1, mergeStored),
  ),
)

/** 已启用配方的提示词片段，没有可用配方时返回空字符串。 */
export function activeRecipePrompt(): string {
  const items = useRecipesStore.getState().items
    .filter(item => item.enabled && item.approved)
  if (items.length === 0)
    return ''

  const entries = items.map((item) => {
    const keywords = item.keywords.length > 0 ? `（代码词：${item.keywords.join('、')}）` : ''
    const mode = item.background ? '（后台执行，不打断当前话题）' : ''
    return `- ${item.name}${keywords}${mode}：${item.prompt}`
  })
  return `主人启用了这些配方：\n${entries.join('\n')}`
}

/** 允许角色提议配方时附加的说明，未开启时返回空字符串。 */
export function recipeProposalPrompt(): string {
  if (!useRecipesStore.getState().proposalsEnabled)
    return ''

  return '主人给出可复用的新规则或说话方式时，可以用一句话提议把它保存为配方。'
}

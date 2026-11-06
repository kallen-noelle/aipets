/**
 * 提供商域：模型接口地址与凭据。
 *
 * 凭据只存在本域，不混进其他配置，便于将来换成系统级加密存储。
 * 能力标签决定提供商出现在哪些用途的选择列表里。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const providerCapabilities = ['chat', 'speech', 'transcription'] as const

export type ProviderCapability = typeof providerCapabilities[number]

/** 用途分组的显示信息，列表页按它分页签。 */
export const providerTaskGroups: Array<{ id: ProviderCapability, label: string }> = [
  { id: 'chat', label: '对话' },
  { id: 'speech', label: '朗读' },
  { id: 'transcription', label: '转写' },
]

export const providerSchema = z.object({
  id: z.string().min(1, '缺少标识'),
  label: z.string().min(1, '请填写名称'),
  baseUrl: z.url('请填写合法的接口地址'),
  apiKey: z.string(),
  capabilities: z.array(z.enum(providerCapabilities)).min(1, '至少选择一种用途'),
})

export type Provider = z.infer<typeof providerSchema>

/** 预置提供商：名称、接口地址与支持的用途。地址由预置固定，界面不提供修改。 */
export interface ProviderPreset {
  id: string
  label: string
  description: string
  baseUrl: string
  capabilities: ProviderCapability[]
}

export const providerPresets: ProviderPreset[] = [
  {
    id: 'preset-openai',
    label: 'OpenAI',
    description: '官方接口，对话、朗读与转写。',
    baseUrl: 'https://api.openai.com/v1',
    capabilities: ['chat', 'speech', 'transcription'],
  },
  {
    id: 'preset-deepseek',
    label: 'DeepSeek',
    description: '兼容接口，仅对话。',
    baseUrl: 'https://api.deepseek.com/v1',
    capabilities: ['chat'],
  },
  {
    id: 'preset-dashscope',
    label: '阿里百炼',
    description: '兼容接口，对话、朗读与转写。',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    capabilities: ['chat', 'speech', 'transcription'],
  },
  {
    id: 'preset-volcengine',
    label: '火山方舟',
    description: '兼容接口，对话与视觉。',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    capabilities: ['chat'],
  },
  {
    id: 'preset-zhipu',
    label: '智谱清言',
    description: '兼容接口，仅对话。',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    capabilities: ['chat'],
  },
  {
    id: 'preset-moonshot',
    label: '月之暗面',
    description: '兼容接口，仅对话。',
    baseUrl: 'https://api.moonshot.cn/v1',
    capabilities: ['chat'],
  },
  {
    id: 'preset-siliconflow',
    label: '硅基流动',
    description: '兼容接口，对话与转写。',
    baseUrl: 'https://api.siliconflow.cn/v1',
    capabilities: ['chat', 'transcription'],
  },
  {
    id: 'preset-ollama',
    label: 'Ollama',
    description: '本地服务，不需要 Key。',
    baseUrl: 'http://127.0.0.1:11434/v1',
    capabilities: ['chat'],
  },
]

export const defaultProviders: Provider[] = [
  {
    id: 'openai',
    label: 'OpenAI 兼容',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    capabilities: ['chat', 'speech', 'transcription'],
  },
]

interface ProvidersState {
  items: Provider[]
  /** 对话使用的提供商。 */
  activeId: string | null
  /** 朗读使用的提供商，空字符串表示跟随对话。 */
  speechId: string
  /** 转写使用的提供商，空字符串表示跟随对话。 */
  transcriptionId: string
  upsert: (provider: Provider) => void
  remove: (id: string) => void
  setActive: (id: string | null) => void
  setSpeech: (id: string) => void
  setTranscription: (id: string) => void
  reset: () => void
}

/**
 * 合并已存配置。
 *
 * 旧版本没有能力标签与按用途的激活项，补齐默认值再交给界面。
 */
function mergeStored(persisted: unknown, current: ProvidersState): ProvidersState {
  const saved = (persisted ?? {}) as Partial<ProvidersState>
  const items = (saved.items ?? current.items).map(item => ({
    ...item,
    capabilities: item.capabilities?.length ? item.capabilities : ['chat'] as ProviderCapability[],
  }))

  return {
    ...current,
    ...saved,
    items,
    activeId: saved.activeId ?? null,
    speechId: saved.speechId ?? '',
    transcriptionId: saved.transcriptionId ?? '',
  }
}

export const useProvidersStore = create<ProvidersState>()(
  persist(
    set => ({
      items: defaultProviders,
      activeId: null,
      speechId: '',
      transcriptionId: '',
      upsert: provider => set((state) => {
        const others = state.items.filter(item => item.id !== provider.id)
        return { items: [...others, provider], activeId: state.activeId ?? provider.id }
      }),
      remove: id => set(state => ({
        items: state.items.filter(item => item.id !== id),
        activeId: state.activeId === id ? null : state.activeId,
        speechId: state.speechId === id ? '' : state.speechId,
        transcriptionId: state.transcriptionId === id ? '' : state.transcriptionId,
      })),
      setActive: id => set({ activeId: id }),
      setSpeech: id => set({ speechId: id }),
      setTranscription: id => set({ transcriptionId: id }),
      reset: () => set({
        items: defaultProviders,
        activeId: null,
        speechId: '',
        transcriptionId: '',
      }),
    }),
    persistOptions<ProvidersState>('providers', 1, mergeStored),
  ),
)

/** 当前激活的对话提供商，没有时返回 null。 */
export function activeProvider(): Provider | null {
  const { items, activeId } = useProvidersStore.getState()
  return items.find(item => item.id === activeId) ?? null
}

/** 某个用途可选的提供商。 */
export function providersWith(capability: ProviderCapability): Provider[] {
  return useProvidersStore.getState().items
    .filter(item => item.capabilities.includes(capability))
}

/**
 * 按用途取提供商。
 *
 * 先取单独指定的提供商，再取第一个支持该用途的提供商，
 * 最后退回对话提供商。这样对话提供商不支持语音时不会误用它。
 */
function providerForTask(capability: ProviderCapability, id: string): Provider | null {
  const items = useProvidersStore.getState().items
  return items.find(item => item.id === id)
    ?? items.find(item => item.capabilities.includes(capability))
    ?? activeProvider()
}

/** 朗读提供商，未单独指定时取第一个支持朗读的提供商。 */
export function speechProvider(): Provider | null {
  return providerForTask('speech', useProvidersStore.getState().speechId)
}

/** 转写提供商，未单独指定时取第一个支持转写的提供商。 */
export function transcriptionProvider(): Provider | null {
  return providerForTask('transcription', useProvidersStore.getState().transcriptionId)
}

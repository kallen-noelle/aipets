/**
 * 状态上下文：把世界与角色事实转成提示词区块。
 *
 * 提供者只返回事实与“该事实对动作选择的影响”。代码不判断具体动作，
 * 选择交给模型。新增状态只需注册一个提供者。
 */

export interface StateEntry {
  label: string
  value: string
  /** 给模型的动作提示，不是代码判断。 */
  guidance: string
}

export interface StateContext {
  characterId: string
  instanceId: string
  now: Date
  /** 最近播放过的片段名，最新的在前。 */
  recentClips: string[]
}

export type StateProviderResult = StateEntry | StateEntry[] | undefined

export type StateProvider = (context: StateContext) => StateProviderResult | Promise<StateProviderResult>

const worldProviders = new Set<StateProvider>()
const characterProviders = new Set<StateProvider>()

export function registerWorldStateProvider(provider: StateProvider): () => void {
  worldProviders.add(provider)
  return () => {
    worldProviders.delete(provider)
  }
}

export function registerCharacterStateProvider(provider: StateProvider): () => void {
  characterProviders.add(provider)
  return () => {
    characterProviders.delete(provider)
  }
}

function entriesOf(result: StateProviderResult): StateEntry[] {
  if (!result)
    return []
  return Array.isArray(result) ? result : [result]
}

async function collect(providers: Set<StateProvider>, context: StateContext): Promise<StateEntry[]> {
  const results = await Promise.all([...providers].map(provider => provider(context)))
  return results.flatMap(entriesOf)
}

function buildSection(title: string, entries: StateEntry[]): string[] {
  if (!entries.length)
    return []

  return [
    title,
    ...entries.map(entry => `- ${entry.label}：${entry.value}\n  动作提示：${entry.guidance}`),
  ]
}

/** 构建导演提示词共用的状态区块。 */
export async function buildStatePrompt(context: StateContext): Promise<string> {
  const world = await collect(worldProviders, context)
  const character = await collect(characterProviders, context)
  const recent = context.recentClips.length
    ? [
        '最近已播：',
        `- ${context.recentClips.join('、')}\n  动作提示：避免连续重复这些片段，除非对话需要。`,
      ]
    : []

  return [
    '下面是当前事实。它们如何影响本轮回复的语气与动作，由你判断。',
    '',
    ...buildSection('世界状态：', world),
    ...buildSection('角色状态：', character),
    ...recent,
  ].join('\n').trim()
}

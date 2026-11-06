/**
 * 角色资源与播放的类型。
 *
 * 索引由 `characters.config.json` 描述，zod schema 在 `catalog.ts`。
 * 片段（clip）是最小播放单元，状态（state）是片段的分组。
 */

/**
 * 一个片段。
 *
 * 长动作在资源里拆成 start / loop / end 三段，这里用 `segments` 表示一段
 * 连续演出；只有一个文件时数组长度为 1。
 */
export interface CharacterClip {
  segments: string[]
  weight: number
  loop: boolean
  /** 情绪或动作标签，来自资源索引。情绪片段用它决定契合度。 */
  tags?: string[]
}

/**
 * 运行时状态。只有这五个状态会占用角色状态机：
 * - idle：待机
 * - speaking：说话
 * - thinking：思考
 * - petted：被点击的一次性回应
 * - dragging：被拖拽悬空
 */
export type CharacterStateName = 'idle' | 'speaking' | 'thinking' | 'petted' | 'dragging'

/**
 * 播放池。`emotion` 与 `actions` 不进入状态机，由导演在空闲时偶发插入，
 * 用来表现情绪与长动作。
 */
export type CharacterPoolName = 'emotion' | 'actions'

/** 角色定义：元信息、人设与全部片段分组。 */
export interface CharacterDefinition {
  id: string
  name: string
  /** 英文名，设置页做副标题用。 */
  roman: string
  /** 一句话定位，例如“温柔 · 俏皮”。 */
  role: string
  description: string
  accent: string
  /** 排序权重，小的排前面。 */
  order: number
  canvas: { width: number, height: number }
  fadeMs: number
  persona: string
  states: Record<CharacterStateName, CharacterClip[]>
  pools: Record<CharacterPoolName, CharacterClip[]>
}

/** 整份资源索引。 */
export interface CharactersCatalog {
  schemaVersion: number
  characters: CharacterDefinition[]
}

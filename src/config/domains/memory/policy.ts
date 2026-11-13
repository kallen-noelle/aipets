/**
 * 记忆策略：领域模型与纯函数。
 *
 * 这一层不依赖 zustand、persist 或任何模型客户端，可以在测试里直接调用。
 * 写入规则、注入排序、预算裁剪与转义都集中在这里，保证设置页、模型工具与
 * 自动提取三条路径共用同一套判断。
 */

import { z } from 'zod'

/** 自动提取条目的默认置信度。 */
export const DEFAULT_EXTRACTED_CONFIDENCE = 0.6
/** 手动条目视为用户确认，置信度取最大值。 */
export const MANUAL_CONFIDENCE = 1
/** 单轮注入记忆的字符预算，防止长期记忆挤占上下文。 */
export const MEMORY_INJECTION_BUDGET = 1200

export const memoryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, '请填写名称'),
  description: z.string().max(60, '一句话说明不超过 60 字'),
  content: z.string().min(1, '请填写内容'),
  createdAt: z.number(),
  /** 最后一次写入或确认的时间，用于排序与同名覆盖判断。 */
  updatedAt: z.number(),
  /** 0 到 1，自动提取的把握程度；手动条目固定为 1。 */
  confidence: z.number().min(0).max(1),
  /** 来源：自动提取还是用户明确说明。 */
  source: z.enum(['extracted', 'manual']),
  /** 所属实例；空值表示所有实例共享。 */
  instanceId: z.string().optional(),
  /** 所属角色，为将来按角色隔离预留；当前只作为归属信息保存。 */
  characterId: z.string().optional(),
})

export type MemoryEntry = z.infer<typeof memoryEntrySchema>
export type MemoryEntrySource = 'extracted' | 'manual'

export const memorySettingsSchema = z.object({
  /** 是否把历史消息发给模型。 */
  shortTermEnabled: z.boolean(),
  /** 保留的历史消息条数。 */
  shortTermWindow: z.number().min(2).max(50),
  /** 长期记忆总开关。 */
  longTermEnabled: z.boolean(),
  /** 是否在模型调用前自动注入预算内的记忆。 */
  middlewareEnabled: z.boolean(),
  /** 是否向模型提供记忆检索/写入/遗忘工具。 */
  toolsEnabled: z.boolean(),
})

export type MemorySettings = z.infer<typeof memorySettingsSchema>

/** 一条记忆的作用域：实例为空表示所有实例共享。 */
export interface MemoryScope {
  instanceId?: string
  characterId?: string
}

/** 写入记忆时的输入，id 与时间戳由 store 生成。 */
export interface MemoryWrite {
  name: string
  description?: string
  content: string
  confidence?: number
}

/** 一次写入的结果统计。 */
export interface UpsertResult {
  entries: MemoryEntry[]
  added: number
  updated: number
}

/** 注入选择的结果，供中间件记录观测数据。 */
export interface MemorySelection {
  entries: MemoryEntry[]
  text: string
  count: number
  omitted: number
  chars: number
}

/** 运行时状态：只用于设置页展示，不参与记忆内容判断。 */
export interface MemoryRuntimeStatus {
  lastExtractAt: number | null
  lastExtractOk: boolean | null
  lastExtractCount: number
  lastExtractError: string | null
  lastInjectAt: number | null
  lastInjectOk: boolean | null
  lastInjectCount: number
  lastInjectChars: number
  lastInjectError: string | null
  toolCallCount: number
  lastToolName: string | null
  lastToolAt: number | null
  lastToolError: string | null
}

/** 初值：设置与运行状态分离，运行状态不持久化时也能安全回退。 */
export const DEFAULT_SETTINGS: MemorySettings = {
  shortTermEnabled: true,
  shortTermWindow: 12,
  longTermEnabled: true,
  middlewareEnabled: true,
  toolsEnabled: true,
}

export const DEFAULT_STATUS: MemoryRuntimeStatus = {
  lastExtractAt: null,
  lastExtractOk: null,
  lastExtractCount: 0,
  lastExtractError: null,
  lastInjectAt: null,
  lastInjectOk: null,
  lastInjectCount: 0,
  lastInjectChars: 0,
  lastInjectError: null,
  toolCallCount: 0,
  lastToolName: null,
  lastToolAt: null,
  lastToolError: null,
}

/** 旧数据迁移与持久化归一化共用的类型判断。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 把错误整理成一句可以显示在设置页的短文本。 */
export function briefMemoryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const text = message.trim() || '未知错误'
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

/** 名称归一化：全角转半角、忽略大小写与空白，用于判断“同名”。 */
export function normalizeMemoryName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/**
 * 归一化一条已存的记忆。
 *
 * 旧数据没有来源与置信度：缺 `source` 视为 manual，缺 `confidence` 给 0.6，
 * 缺 `updatedAt` 用 `createdAt`。这样老用户的记忆不会丢，也不会被自动提取
 * 悄悄覆盖。
 */
export function normalizeMemoryEntry(value: unknown): MemoryEntry | null {
  if (!isRecord(value))
    return null

  const id = value.id
  const name = value.name
  const content = value.content
  if (typeof id !== 'string' || !id.trim())
    return null
  if (typeof name !== 'string' || !name.trim())
    return null
  if (typeof content !== 'string' || !content.trim())
    return null

  const createdAt = isFiniteNumber(value.createdAt) ? value.createdAt : Date.now()
  const updatedAt = isFiniteNumber(value.updatedAt) ? value.updatedAt : createdAt
  const confidence = isFiniteNumber(value.confidence)
    ? clamp(value.confidence, 0, 1)
    : DEFAULT_EXTRACTED_CONFIDENCE
  const source: MemoryEntrySource = value.source === 'extracted' ? 'extracted' : 'manual'
  const description = typeof value.description === 'string' ? value.description : ''
  const instanceId = typeof value.instanceId === 'string' && value.instanceId ? value.instanceId : undefined
  const characterId = typeof value.characterId === 'string' && value.characterId ? value.characterId : undefined

  return {
    id,
    name,
    description,
    content,
    createdAt,
    updatedAt,
    confidence,
    source,
    ...(instanceId ? { instanceId } : {}),
    ...(characterId ? { characterId } : {}),
  }
}

/** 当前作用域能看到的条目：共享条目加上本实例自己的条目。 */
export function visibleEntries(entries: MemoryEntry[], scope: MemoryScope): MemoryEntry[] {
  return entries.filter(entry => !entry.instanceId || entry.instanceId === scope.instanceId)
}

function nextEntryId(entries: MemoryEntry[], now: number): string {
  let sequence = entries.length
  let id = `mem-${now}-${sequence}`
  while (entries.some(item => item.id === id)) {
    sequence += 1
    id = `mem-${now}-${sequence}`
  }
  return id
}

/**
 * 统一的写入实现。
 *
 * - manual：用户明确说明，覆盖同名条目（包括把自动条目升级为手动）；
 * - extracted：遇到同名手动条目直接跳过；同名自动条目按置信度与更新时间决定是否覆盖。
 * 覆盖时保留原 id 与 createdAt，保证引用与历史稳定。
 */
export function upsertMemoryEntries(
  entries: MemoryEntry[],
  writes: MemoryWrite[],
  options: { scope: MemoryScope, source: MemoryEntrySource, now: number },
): UpsertResult {
  const working = entries.map(item => ({ ...item }))
  let added = 0
  let updated = 0

  for (const write of writes) {
    const name = write.name.trim()
    const content = write.content.trim()
    if (!name || !content)
      continue

    const key = normalizeMemoryName(name)
    if (!key)
      continue

    const candidates = working.filter(entry =>
      (!entry.instanceId || entry.instanceId === options.scope.instanceId)
      && normalizeMemoryName(entry.name) === key,
    )
    const manualCandidate = candidates.find(entry => entry.source === 'manual')

    // 自动提取永远不覆盖用户明确说过的内容。
    if (options.source === 'extracted' && manualCandidate)
      continue

    const target = options.source === 'manual'
      ? (manualCandidate ?? candidates[0])
      : candidates.find(entry => entry.source === 'extracted')

    if (!target) {
      working.push({
        id: nextEntryId(working, options.now),
        name,
        description: (write.description ?? '').trim(),
        content,
        createdAt: options.now,
        updatedAt: options.now,
        confidence: options.source === 'manual'
          ? MANUAL_CONFIDENCE
          : clamp(write.confidence ?? DEFAULT_EXTRACTED_CONFIDENCE, 0, 1),
        source: options.source,
        ...(options.scope.instanceId ? { instanceId: options.scope.instanceId } : {}),
        ...(options.scope.characterId ? { characterId: options.scope.characterId } : {}),
      })
      added += 1
      continue
    }

    const nextConfidence = options.source === 'manual'
      ? MANUAL_CONFIDENCE
      : clamp(write.confidence ?? DEFAULT_EXTRACTED_CONFIDENCE, 0, 1)

    if (options.source === 'extracted') {
      // 置信度更高才覆盖；相同置信度时以更晚的信息为准。
      if (nextConfidence < target.confidence)
        continue
      if (nextConfidence === target.confidence && options.now < target.updatedAt)
        continue
    }

    const index = working.indexOf(target)
    working[index] = {
      ...target,
      name,
      description: (write.description ?? '').trim(),
      content,
      updatedAt: options.now,
      confidence: nextConfidence,
      source: options.source,
      ...(target.characterId ?? options.scope.characterId
        ? { characterId: target.characterId ?? options.scope.characterId }
        : {}),
    }
    updated += 1
  }

  return { entries: working, added, updated }
}

function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/** 把查询拆成中文 bigram 与整串，用于非常轻量的关键词匹配。 */
function queryTokens(query: string): Set<string> {
  const normalized = normalizeForMatch(query)
  const tokens = new Set<string>()
  if (!normalized)
    return tokens
  if (normalized.length <= 2) {
    tokens.add(normalized)
    return tokens
  }
  for (let index = 0; index < normalized.length - 1; index++)
    tokens.add(normalized.slice(index, index + 2))
  return tokens
}

function relevanceOf(entry: MemoryEntry, tokens: Set<string>): number {
  if (tokens.size === 0)
    return 0

  const haystack = normalizeForMatch(`${entry.name}${entry.description}${entry.content}`)
  let hits = 0
  for (const token of tokens) {
    if (haystack.includes(token))
      hits += 1
  }
  return hits
}

/** 注入时的排序：手动 > 相关度 > 置信度 > 更新时间。 */
function compareEntries(
  left: { entry: MemoryEntry, relevance: number },
  right: { entry: MemoryEntry, relevance: number },
): number {
  const leftManual = left.entry.source === 'manual' ? 1 : 0
  const rightManual = right.entry.source === 'manual' ? 1 : 0
  if (leftManual !== rightManual)
    return rightManual - leftManual
  if (left.relevance !== right.relevance)
    return right.relevance - left.relevance
  if (left.entry.confidence !== right.entry.confidence)
    return right.entry.confidence - left.entry.confidence
  return right.entry.updatedAt - left.entry.updatedAt
}

/** XML 转义，避免记忆内容逃逸出 `<memory>` 片段。 */
export function escapeMemoryText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatEntryForPrompt(entry: MemoryEntry): string {
  const name = escapeMemoryText(entry.name)
  const description = escapeMemoryText(entry.description.trim())
  const content = escapeMemoryText(entry.content.trim())

  if (!description)
    return `- ${name}：${content}`

  return `- ${name}：${description}\n  ${content}`
}

/**
 * 按预算挑选并格式化要注入的记忆。
 *
 * 条目由调用方显式传入，这一层不读取 store；返回的文本已用 `<memory>` 包裹，
 * 超出预算的条目被裁掉并留下省略标记。
 */
export function selectMemories(options: {
  entries: MemoryEntry[]
  instanceId?: string
  query?: string
  budget?: number
}): MemorySelection {
  const budget = options.budget ?? MEMORY_INJECTION_BUDGET
  const tokens = queryTokens(options.query ?? '')
  const sorted = visibleEntries(options.entries, { instanceId: options.instanceId })
    .map(entry => ({ entry, relevance: relevanceOf(entry, tokens) }))
    .sort(compareEntries)

  const header = '<memory>'
  const footer = '</memory>'
  const lines: string[] = []
  // 预留首尾标签与两个换行的长度。
  let used = header.length + footer.length + 2
  let omitted = 0

  for (const item of sorted) {
    const line = formatEntryForPrompt(item.entry)
    if (used + line.length + 1 > budget) {
      omitted = sorted.length - lines.length
      break
    }
    lines.push(line)
    used += line.length + 1
  }

  if (lines.length === 0)
    return { entries: [], text: '', count: 0, omitted: sorted.length, chars: 0 }

  const marker = omitted > 0 ? `\n- 还有 ${omitted} 条记忆因预算未注入` : ''
  const text = `${header}\n${lines.join('\n')}${marker}\n${footer}`
  const chosen = sorted.slice(0, lines.length).map(item => item.entry)
  return { entries: chosen, text, count: chosen.length, omitted, chars: text.length }
}

/** 按关键词在当前作用域内检索记忆，供工具通道使用。 */
export function searchMemoryEntries(
  entries: MemoryEntry[],
  query: string,
  scope: MemoryScope,
  limit: number,
): MemoryEntry[] {
  const tokens = queryTokens(query)
  return visibleEntries(entries, scope)
    .map(entry => ({ entry, relevance: relevanceOf(entry, tokens) }))
    .filter(item => tokens.size === 0 || item.relevance > 0)
    .sort(compareEntries)
    .slice(0, limit)
    .map(item => item.entry)
}

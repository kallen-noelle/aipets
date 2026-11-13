/**
 * 记忆自动提取。
 *
 * 放在 llm 层：这一步要调用模型，而记忆域本身不应该依赖模型客户端。
 * 每轮对话结束后在后台运行，失败只记录状态，不影响回复。
 */

import { HumanMessage, SystemMessage } from 'langchain'
import { z } from 'zod'

import { useMemoryStore, type MemoryScope, type UpsertResult } from '@/config/domains/memory'

import { createChatModel } from './client'

/** 模型必须按这个结构返回，保证写入记忆库的条目形状稳定。 */
const extractionSchema = z.object({
  memories: z.array(z.object({
    name: z.string().describe('简短名称，例如“主人的口味”'),
    description: z.string().describe('一句话说明'),
    content: z.string().describe('完整描述，包含上下文'),
    // 置信度越界或类型不对时丢弃该字段，不让整批提取失败。
    confidence: z.number().optional().catch(undefined).describe('0 到 1 的把握程度，不确定时省略'),
  })).describe('值得长期记住的新信息；没有就返回空数组'),
})

export type ExtractedMemory = z.infer<typeof extractionSchema>['memories'][number]

const JSON_SHAPE = '{"memories":[{"name":"简短名称","description":"一句话说明","content":"完整描述","confidence":0.8}]}'

const SYSTEM_PROMPT = [
  '你负责整理对话记忆。',
  '只提取长期有效的事实或偏好，例如姓名、习惯、喜好、约定。',
  '忽略寒暄、临时情绪与一次性的闲聊内容。',
  'name 要简短且能唯一标识这条信息，description 一句话，content 补充细节。',
  'confidence 是 0 到 1 的小数，表示这条信息的确定程度；推测出来的内容给低分。',
  // 只用提示词约束 JSON，不依赖 response_format，兼容只支持基础接口的提供商。
  `只输出 JSON，不要解释。格式：${JSON_SHAPE}。没有新信息时输出 {"memories":[]}。`,
].join('\n')

/** 从可能带代码块或说明文字的回答里截出 JSON 对象。 */
function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start)
    throw new Error('回答里没有 JSON 对象')

  return JSON.parse(text.slice(start, end + 1))
}

/**
 * 从一轮对话里提取记忆条目。
 *
 * 模型不可用或返回格式不对时抛出错误，由调用方决定如何记录。
 */
export async function extractMemories(
  userText: string,
  assistantText: string,
): Promise<ExtractedMemory[]> {
  const model = createChatModel()
  const result = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(`用户：${userText}\n角色：${assistantText}`),
  ])

  const text = typeof result.content === 'string'
    ? result.content
    : result.content.map(part => (typeof part === 'string' ? part : JSON.stringify(part))).join('')

  const parsed = extractionSchema.safeParse(parseJsonObject(text))
  if (!parsed.success)
    throw new Error(`记忆提取返回格式不正确：${parsed.error.message}`)

  return parsed.data.memories.filter(item => item.name.trim() && item.content.trim())
}

/**
 * 提取并写入记忆库。
 *
 * 写入与工具通道共用同一套 upsert 规则：同名手动条目不会被覆盖，同名自动
 * 条目按置信度与更新时间决定是否更新。
 */
export async function extractAndRemember(
  userText: string,
  assistantText: string,
  scope: MemoryScope = {},
): Promise<UpsertResult> {
  const extracted = await extractMemories(userText, assistantText)
  if (extracted.length === 0) {
    return { entries: useMemoryStore.getState().entries, added: 0, updated: 0 }
  }

  return useMemoryStore.getState().upsertExtracted(extracted, scope)
}

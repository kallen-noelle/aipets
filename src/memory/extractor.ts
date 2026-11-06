/**
 * 记忆自动提取。
 *
 * 每轮对话结束后，让模型按固定 JSON 输出挑出值得长期记住的信息。提取在
 * 后台进行，不阻塞回复；失败只记录日志，不影响对话。
 */

import { HumanMessage, SystemMessage } from 'langchain'
import { z } from 'zod'

import { useMemoryStore } from '@/config/domains/memory'
import { createChatModel } from '@/llm/client'

/** 模型必须按这个结构返回，保证写入记忆库的条目形状稳定。 */
const extractionSchema = z.object({
  memories: z.array(z.object({
    name: z.string().describe('简短名称，例如“主人的口味”'),
    description: z.string().describe('一句话说明'),
    content: z.string().describe('完整描述，包含上下文'),
  })).describe('值得长期记住的新信息；没有就返回空数组'),
})

export type ExtractedMemory = z.infer<typeof extractionSchema>['memories'][number]

const JSON_SHAPE = '{"memories":[{"name":"简短名称","description":"一句话说明","content":"完整描述"}]}'

const SYSTEM_PROMPT = [
  '你负责整理对话记忆。',
  '只提取长期有效的事实或偏好，例如姓名、习惯、喜好、约定。',
  '忽略寒暄、临时情绪与一次性的闲聊内容。',
  'name 要简短且能唯一标识这条信息，description 一句话，content 补充细节。',
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
 * 同名条目视为已知信息，不重复写入。指定实例标识时条目只属于该实例。
 */
export async function extractAndRemember(
  userText: string,
  assistantText: string,
  instanceId?: string,
): Promise<number> {
  const extracted = await extractMemories(userText, assistantText)
  if (extracted.length === 0)
    return 0

  const store = useMemoryStore.getState()
  const known = new Set(
    store.entries
      .filter(entry => !entry.instanceId || entry.instanceId === instanceId)
      .map(entry => entry.name),
  )
  let added = 0

  for (const item of extracted) {
    if (known.has(item.name))
      continue

    known.add(item.name)
    store.add({ ...item, ...(instanceId ? { instanceId } : {}) })
    added++
  }

  return added
}

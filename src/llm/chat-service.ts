/**
 * 对话服务：流式调用 Agent，并在失败时回退到一次性调用。
 *
 * 界面只调用 `streamChat`，不接触 LangChain 的细节。
 */

import { AIMessage, HumanMessage, type BaseMessage } from 'langchain'

import type { CharacterDefinition } from '@/character/types'
import { useChatConfigStore } from '@/config/domains/chat'
import type { ChatMessage } from '@/config/domains/sessions'

import { createCharacterAgent } from './agent'
import { builtinTools } from './builtin-tools'
import { MissingConfigError } from './client'
import { loadAgentTools } from '@/mcp/tools'

export interface ChatStreamHandlers {
  onToken: (text: string) => void
  onDone: (full: string) => void
  onError: (message: string) => void
  /** 本轮调用到的工具名，用于聊天里的工具卡片。 */
  onTools?: (names: string[]) => void
}

export interface StreamChatOptions {
  character: CharacterDefinition
  /** 本轮使用的角色实例标识，决定角色卡与记忆范围。 */
  instanceId: string
  history: ChatMessage[]
  input: string
  /** 本轮附带的图片，data URL 或远程地址。 */
  imageUrl?: string
  handlers: ChatStreamHandlers
  signal?: AbortSignal
}

/** 从消息内容里取纯文本，兼容字符串与内容块数组。 */
function textOf(content: unknown): string {
  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (part && typeof part === 'object' && 'text' in part)
          return String((part as { text?: unknown }).text ?? '')
        return ''
      })
      .join('')
  }

  return ''
}

type ContentPart =
  | { type: 'text', text: string }
  | { type: 'image_url', image_url: { url: string } }

/** 带图片时转成内容块数组，不带图片保持纯文本。 */
function contentOf(text: string, imageUrl?: string): string | ContentPart[] {
  if (!imageUrl)
    return text

  const parts: ContentPart[] = []
  if (text)
    parts.push({ type: 'text', text })
  parts.push({ type: 'image_url', image_url: { url: imageUrl } })
  return parts
}

function toLangChainMessage(message: ChatMessage): BaseMessage {
  return message.role === 'user'
    ? new HumanMessage(contentOf(message.content, message.imageUrl))
    : new AIMessage(message.content)
}

function errorMessage(error: unknown): string {
  if (error instanceof MissingConfigError)
    return error.message
  if (error instanceof Error)
    return error.message

  return '对话失败'
}

/**
 * 流式对话。
 *
 * 先试流式；流式在拿到任何内容之前失败时，回退到一次性调用，保证兼容
 * 不支持流式的接口。
 */
export async function streamChat(options: StreamChatOptions): Promise<void> {
  const { character, instanceId, history, input, imageUrl, handlers, signal } = options

  let agent: ReturnType<typeof createCharacterAgent>
  try {
    // 内置工具与 MCP 服务器在这里合并成可用工具。
    const tools = [...builtinTools(character.id), ...await loadAgentTools()]
    agent = createCharacterAgent(character, tools, {
      instanceId,
      hasImage: Boolean(imageUrl),
      hasTools: tools.length > 0,
    })
  }
  catch (error) {
    handlers.onError(errorMessage(error))
    return
  }

  const messages: BaseMessage[] = [
    ...history.map(toLangChainMessage),
    new HumanMessage(contentOf(input, imageUrl)),
  ]
  const recursionLimit = useChatConfigStore.getState().maxSteps

  let full = ''
  const toolNames = new Set<string>()
  try {
    const stream = await agent.stream(
      { messages },
      { streamMode: 'messages', signal, recursionLimit },
    )

    for await (const event of stream) {
      const chunk = event[0]
      if (!chunk || typeof chunk !== 'object')
        continue

      // 工具调用分片只带名字，不产生正文。
      const calls = (chunk as { tool_call_chunks?: Array<{ name?: string }> }).tool_call_chunks
      if (calls) {
        for (const call of calls) {
          if (call.name)
            toolNames.add(call.name)
        }
      }

      const text = textOf((chunk as { content?: unknown }).content)
      if (!text)
        continue

      full += text
      handlers.onToken(text)
    }

    if (toolNames.size > 0)
      handlers.onTools?.([...toolNames])

    if (full)
      handlers.onDone(full)
    else
      await invokeFallback(agent, messages, handlers, recursionLimit)
  }
  catch (error) {
    if (signal?.aborted)
      return

    if (full) {
      handlers.onDone(full)
      return
    }

    // 流式不可用时退到一次性调用。
    try {
      await invokeFallback(agent, messages, handlers, recursionLimit)
    }
    catch {
      handlers.onError(errorMessage(error))
    }
  }
}

async function invokeFallback(
  agent: ReturnType<typeof createCharacterAgent>,
  messages: BaseMessage[],
  handlers: ChatStreamHandlers,
  recursionLimit: number,
): Promise<void> {
  const result = await agent.invoke({ messages }, { recursionLimit })
  const last = result.messages[result.messages.length - 1]
  const text = textOf(last?.content)

  if (text) {
    handlers.onToken(text)
    handlers.onDone(text)
  }
  else {
    handlers.onError('模型没有返回内容')
  }
}

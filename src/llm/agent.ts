/**
 * 角色对话 Agent 的构建。
 *
 * 中间件与工具都挂在这里：上下文过长时摘要压缩，工具由阶段 8 接入。
 */

import {
  type BaseMessage,
  createAgent,
  summarizationMiddleware,
} from 'langchain'

import type { CharacterDefinition } from '@/character/types'
import { cardOverride } from '@/config/domains/card'
import { useChatConfigStore } from '@/config/domains/chat'
import { memorySummary, useMemoryStore } from '@/config/domains/memory'
import { activeRecipePrompt, recipeProposalPrompt } from '@/config/domains/recipes'
import { useVisionStore } from '@/config/domains/vision'
import type { AgentTool } from '@/mcp/tools'

import { createChatModel } from './client'
import { buildSystemPrompt } from './prompts'

/** 摘要后保留的最近消息条数。 */
const KEEP_MESSAGES = 8

/**
 * Agent 的对外契约。
 *
 * createAgent 的返回类型会随中间件状态 schema 收窄，调用方不需要也不应该
 * 依赖那些推断细节，这里收敛成实际用到的两个方法。
 */
export interface StreamingAgent {
  stream: (
    input: { messages: BaseMessage[] },
    options: { streamMode: 'messages', signal?: AbortSignal, recursionLimit: number },
  ) => Promise<AsyncIterable<[unknown, unknown]>>
  invoke: (
    input: { messages: BaseMessage[] },
    options: { recursionLimit: number },
  ) => Promise<{ messages: BaseMessage[] }>
}

export interface AgentOptions {
  /** 本轮使用的角色实例标识，决定读取哪张角色卡。 */
  instanceId?: string
  /** 本轮是否带图片，带图时按视觉配置换模型。 */
  hasImage?: boolean
  /** 本轮是否接了工具，工具轮次可按开关换视觉模型。 */
  hasTools?: boolean
}

export function createCharacterAgent(
  character: CharacterDefinition,
  tools: AgentTool[] = [],
  options: AgentOptions = {},
): StreamingAgent {
  const instanceId = options.instanceId
  const override = cardOverride(character.id, instanceId ?? '')
  const vision = useVisionStore.getState()
  const visionReady = Boolean(vision.model.trim())
  const chatVision = Boolean(options.hasImage && vision.useForChat)
  const toolVision = Boolean(options.hasTools && vision.useForToolImages)
  const useVision = visionReady && (chatVision || toolVision)
  const model = createChatModel({
    model: useVision ? vision.model : override.model,
    providerId: useVision ? vision.providerId || undefined : undefined,
  })
  const { summaryThreshold } = useChatConfigStore.getState()
  const persona = override.persona?.trim() || character.persona
  const name = override.name?.trim() || character.name
  const memories = useMemoryStore.getState().longTermEnabled ? memorySummary(instanceId) : ''
  // 配方内容与提议说明合并成一段附加要求。
  const recipe = [activeRecipePrompt(), recipeProposalPrompt()].filter(Boolean).join('\n')

  const agent = createAgent({
    model,
    tools,
    systemPrompt: buildSystemPrompt(name, persona, memories, recipe),
    middleware: [
      summarizationMiddleware({
        model,
        // 消息数达到阈值时压缩，保留最近若干条，保证上下文连贯。
        trigger: { messages: summaryThreshold },
        keep: { messages: KEEP_MESSAGES },
      }),
    ],
  })

  return agent as unknown as StreamingAgent
}

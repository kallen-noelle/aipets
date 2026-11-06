/**
 * 对话导演：每轮回复后调用模型，从现有片段名中选择表演序列。
 *
 * 模型只返回片段名，校验与执行交给角色导演。失败时返回 null，规则导演继续。
 */

import { HumanMessage, SystemMessage } from 'langchain'
import { z } from 'zod'

import type { CharacterDefinition } from '@/character/types'
import {
  isLongAction,
  performCandidates,
  type PerformanceStep,
} from '@/character/perform'
import { registerDefaultStateProviders } from '@/character/state-providers'
import { buildStatePrompt } from '@/character/state-context'
import { useAnimationStore } from '@/config/domains/animation'
import { useModelsStore } from '@/config/domains/models'
import { recordDebugEvent } from '@/debug/monitor'

import { createChatModel } from './client'
import { contentText, parseJsonObject, withTimeout } from './model-json'

const TIMEOUT_MS = 20_000
const REPLY_LIMIT = 800
const INPUT_LIMIT = 300

/** 计划步骤：短片段写名称，长动作可附带循环保持时长。 */
const planStepSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    durationMs: z.number().int().positive().optional(),
  }),
])

const planSchema = z.object({
  clips: z.array(planStepSchema).default([]),
  reason: z.string().default(''),
})

export interface DirectorRequest {
  character: CharacterDefinition
  instanceId: string
  userText: string
  replyText: string
  recentClips?: string[]
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function clipList(character: CharacterDefinition): string {
  const lines: string[] = []
  for (const [name, clip] of performCandidates(character)) {
    const kind = isLongAction(clip)
      ? '长动作，start → loop 循环 → end'
      : clip.loop ? '循环片段，仍只播一次' : '一次性片段'
    lines.push(`- ${name}｜${kind}`)
  }
  return lines.join('\n')
}

async function systemPrompt(request: DirectorRequest): Promise<string> {
  const name = request.character.name
  const state = await buildStatePrompt({
    characterId: request.character.id,
    instanceId: request.instanceId,
    now: new Date(),
    recentClips: request.recentClips ?? [],
  })

  return [
    `你是「${name}」的动画导演。只输出一个 JSON 对象，不要 Markdown，不要解释。`,
    request.character.persona ? `人设：${truncate(request.character.persona, 500)}` : '',
    '',
    state,
    '',
    '可选片段（clips 只能填这里的名称）：',
    clipList(request.character),
    '',
    '规则：',
    '- 片段数量由本轮情境决定，不设上限，按数组顺序播放。',
    '- 短片段播放一次，循环片段也只播一次。',
    '- 长动作播放 start → loop 循环 → end；需要控制循环时长时写成对象并给 durationMs（毫秒），不填默认 60000。',
    '- 优先贴合助手回复与用户输入的情绪和语义。',
    '- 不需要额外动作时返回空数组。',
    '',
    '输出示例：',
    '{"clips":["开心跃动",{"name":"悠闲哼歌","durationMs":60000}],"reason":"被夸奖后先开心，再哼歌一会儿"}',
  ].filter(Boolean).join('\n')
}

/**
 * 请求一次表演计划。
 *
 * 返回表演步骤；配置缺失、请求失败、非法 JSON 或没有可用片段时返回 null。
 */
export async function requestPerformancePlan(request: DirectorRequest): Promise<PerformanceStep[] | null> {
  // 未单独配置导演模型时，跟随当前对话模型。
  const directorModel = useAnimationStore.getState().directorModel.trim()
    || (useModelsStore.getState().selected ?? '').trim()
  if (!directorModel) {
    recordDebugEvent('director', 'skip', '导演模型与对话模型均为空')
    return null
  }

  registerDefaultStateProviders()

  let model: ReturnType<typeof createChatModel>
  try {
    model = createChatModel({ model: directorModel })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '导演模型不可用'
    useAnimationStore.getState().update({
      lastClips: [],
      lastReason: '',
      lastError: message,
    })
    recordDebugEvent('director', 'model-error', message)
    return null
  }

  const candidates = performCandidates(request.character)
  recordDebugEvent('director', 'request', `${directorModel}｜候选 ${candidates.size}`)

  const prompt = await systemPrompt(request)
  const messages = [
    new SystemMessage(prompt),
    new HumanMessage([
      `用户说：${truncate(request.userText, INPUT_LIMIT) || '（无文本）'}`,
      `角色回复：${truncate(request.replyText, REPLY_LIMIT)}`,
    ].join('\n')),
  ]

  const result = await withTimeout(
    signal => model.invoke(messages, { signal }),
    TIMEOUT_MS,
  )
  if (!result) {
    useAnimationStore.getState().update({
      lastClips: [],
      lastReason: '',
      lastError: '导演请求失败或超时',
    })
    recordDebugEvent('director', 'timeout', `超过 ${TIMEOUT_MS}ms 或请求失败`)
    return null
  }

  const parsed = parseJsonObject(contentText(result.content))
  const plan = parsed ? planSchema.safeParse(parsed) : null
  if (!plan || !plan.success) {
    useAnimationStore.getState().update({
      lastClips: [],
      lastReason: '',
      lastError: '导演返回的内容不是合法计划',
    })
    recordDebugEvent('director', 'bad-json', contentText(result.content).slice(0, 200))
    return null
  }

  const steps: PerformanceStep[] = []
  for (const item of plan.data.clips) {
    const step = typeof item === 'string' ? { name: item } : item
    const clip = candidates.get(step.name)
    if (!clip)
      continue

    // 只有长动作需要保持时长；短片段的时长由视频本身决定。
    steps.push({
      name: step.name,
      ...(isLongAction(clip) && step.durationMs ? { durationMs: step.durationMs } : {}),
    })
  }

  useAnimationStore.getState().update({
    lastClips: steps.map(step =>
      step.durationMs ? `${step.name} ${Math.round(step.durationMs / 1000)}s` : step.name),
    lastReason: plan.data.reason,
    lastError: steps.length ? '' : '模型没有返回可用片段',
  })
  recordDebugEvent(
    'director',
    steps.length ? 'plan' : 'empty-plan',
    JSON.stringify({ clips: plan.data.clips, steps, reason: plan.data.reason }),
  )

  return steps.length ? steps : null
}

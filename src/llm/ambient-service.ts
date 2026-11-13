/**
 * 环境编排服务：生成约 24 小时的作息阶段。
 *
 * 总时长只累计长动作保持时间。失败时返回错误文本，调用方保留旧编排。
 */

import { HumanMessage, SystemMessage } from 'langchain'

import type { CharacterDefinition } from '@/character/types'
import type { AmbientClip, AmbientProgram } from '@/character/ambient'
import {
  CYCLE_TARGET_MS,
  parseAmbientProgram,
  totalHoldMs,
} from '@/character/ambient'
import {
  DEFAULT_LONG_HOLD_MS,
  entryCandidates,
  isLongAction,
  longActions,
  resolvePerformClip,
} from '@/character/perform'
import { registerDefaultStateProviders } from '@/character/state-providers'
import { buildStatePrompt } from '@/character/state-context'
import { useAnimationStore } from '@/config/domains/animation'
import { useModelsStore } from '@/config/domains/models'
import { recordDebugEvent } from '@/debug/monitor'

import { createChatModel } from './client'
import { contentText, parseJsonObject, withTimeout } from './model-json'

const TIMEOUT_MS = 20_000
const HOUR = 3_600_000

export interface AmbientRequest {
  character: CharacterDefinition
  instanceId: string
  recentClips?: string[]
}

export interface AmbientResult {
  program: AmbientProgram | null
  error: string
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    // fetch/网络错误常把真正原因放在 cause 里。
    const cause = error.cause instanceof Error ? `（${error.cause.message}）` : ''
    return `${error.message}${cause}`
  }
  return String(error ?? '环境编排失败')
}

async function systemPrompt(request: AmbientRequest): Promise<string> {
  const entries = [...entryCandidates(request.character).keys()]
  const holds = longActions(request.character).map(action => action.name)
  const state = await buildStatePrompt({
    characterId: request.character.id,
    instanceId: request.instanceId,
    now: new Date(),
    recentClips: request.recentClips ?? [],
  })

  return [
    `你是「${request.character.name}」的作息编排导演。只输出一个 JSON 对象，不要 Markdown，不要解释。`,
    request.character.persona ? `人设：${truncate(request.character.persona, 500)}` : '',
    '',
    state,
    '',
    `短片（clips 直接写名称，数量由你决定）：${JSON.stringify(entries)}`,
    `长动作（clips 写成 {"name":"名称","durationMs":毫秒}）：${JSON.stringify(holds)}`,
    '',
    '规则：',
    '- 输出一段动作序列 clips，顺序完全由你决定；短片和长动作可以任意排列，长动作前后都可以放短片，也可以不放。',
    `- 总保持时长期望约 ${CYCLE_TARGET_MS / HOUR} 小时；只累计长动作 durationMs，这只是期望，不要求精确，具体多久由你决定。`,
    `- 长动作按 start → loop 循环 durationMs → end 播放；durationMs 不填默认 ${DEFAULT_LONG_HOLD_MS}。`,
    '- 短片播放一次，不计时。',
    '- 只能使用给定清单中的名称。',
    '- 相邻动作尽量不重复；顺序符合作息与当前状态,以当前时间为起点',
    '输出示例：',
    '{"clips":["东张西望",{"name":"悠闲哼歌","durationMs":43200000},{"name":"写代码","durationMs":43200000}],"reason":"..."}',
  ].filter(Boolean).join('\n')
}

/** 把模型返回的 clips 解析成统一动作；只校验名称，不限制数量和顺序。 */
function parseClips(raw: Record<string, unknown>, request: AmbientRequest): AmbientClip[] {
  const clips: AmbientClip[] = []
  const rawClips = Array.isArray(raw.clips) ? raw.clips : []

  for (const item of rawClips) {
    const name = typeof item === 'string'
      ? item
      : item && typeof item === 'object'
        ? (item as { name?: unknown }).name
        : null
    if (typeof name !== 'string' || !name)
      continue

    const clip = resolvePerformClip(request.character, name)
    if (!clip)
      continue

    if (!isLongAction(clip)) {
      // 短片不参与计时，模型即使给了 durationMs 也忽略。
      clips.push({ name })
      continue
    }

    const rawDuration = item && typeof item === 'object'
      ? (item as { durationMs?: unknown }).durationMs
      : undefined
    const duration = typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0
      ? Math.round(rawDuration)
      : DEFAULT_LONG_HOLD_MS

    clips.push({ name, durationMs: duration })
  }

  return clips
}

/**
 * 请求一份环境编排。
 *
 * 模型未配置、没有长动作或返回非法内容时，`program` 为 null 并给出原因。
 */
export async function requestAmbientProgram(request: AmbientRequest): Promise<AmbientResult> {
  // 未单独配置导演模型时，跟随当前对话模型。
  const directorModel = useAnimationStore.getState().directorModel.trim()
    || (useModelsStore.getState().selected ?? '').trim()
  if (!directorModel) {
    recordDebugEvent('ambient', 'skip', '导演模型与对话模型均为空', request.instanceId)
    return { program: null, error: '导演模型未配置' }
  }

  const holds = longActions(request.character)
  if (!holds.length) {
    recordDebugEvent('ambient', 'skip', '没有长动作素材', request.instanceId)
    return { program: null, error: '没有可用的长动作素材' }
  }

  registerDefaultStateProviders()

  let model: ReturnType<typeof createChatModel>
  try {
    model = createChatModel({ model: directorModel })
  }
  catch (error) {
    const message = errorText(error)
    recordDebugEvent('ambient', 'model-error', message, request.instanceId)
    return { program: null, error: message }
  }

  recordDebugEvent('ambient', 'request', `${directorModel}｜长动作 ${holds.length}`, request.instanceId)

  const prompt = await systemPrompt(request)
  const messages = [
    new SystemMessage(prompt),
    new HumanMessage(`现在时间：${new Date().toISOString()}。请编排从此刻开始的作息。`),
  ]

  let failure = ''
  const result = await withTimeout(
    signal => model.invoke(messages, { signal }),
    TIMEOUT_MS,
    (error, timedOut) => {
      failure = timedOut ? `请求超过 ${TIMEOUT_MS}ms 被中止` : errorText(error)
      recordDebugEvent('ambient', 'request-error', failure, request.instanceId)
    },
  )
  if (!result) {
    if (!failure)
      failure = '环境编排请求失败或超时'
    return { program: null, error: failure }
  }

  const parsed = parseJsonObject(contentText(result.content))
  if (!parsed) {
    recordDebugEvent('ambient', 'bad-json', contentText(result.content).slice(0, 200), request.instanceId)
    return { program: null, error: '环境编排返回的内容不是 JSON' }
  }

  const clips = parseClips(parsed, request)
  if (!clips.length) {
    recordDebugEvent('ambient', 'no-clips', contentText(result.content).slice(0, 200), request.instanceId)
    return { program: null, error: '没有可用动作' }
  }

  const program: AmbientProgram = {
    clips,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  }

  const checked = parseAmbientProgram(program)
  if (!checked) {
    recordDebugEvent('ambient', 'invalid', JSON.stringify(program).slice(0, 200), request.instanceId)
    return { program: null, error: '环境编排结构不合法' }
  }

  recordDebugEvent(
    'ambient',
    'plan',
    `${checked.clips.length} 动作｜${Math.round(totalHoldMs(checked.clips) / HOUR)} 小时`,
    request.instanceId,
  )
  return { program: checked, error: '' }
}

/**
 * 环境编排：一段由模型自由编排的动作序列，只累计长动作时长。
 *
 * 与对话编排共用同一种 clips 结构：短片直接写名称，长动作可带 durationMs。
 * 代码不限制动作数量、顺序或时长，只做结构与名称校验。
 */

import { z } from 'zod'

const HOUR = 3_600_000

/** 只用于提示词里的总时长期望描述，不参与代码校验。 */
export const CYCLE_TARGET_MS = 24 * HOUR

const ambientClipInputSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    /** 长动作保持时长；短动作忽略。 */
    durationMs: z.number().int().positive().optional(),
  }),
])

const ambientProgramInputSchema = z.object({
  /** 动作数量与顺序完全由模型决定，只要求至少一个动作。 */
  clips: z.array(ambientClipInputSchema).min(1),
  /** 编排理由，仅用于排查。 */
  reason: z.string().default(''),
})

export interface AmbientClip {
  name: string
  durationMs?: number
}

export interface AmbientProgram {
  clips: AmbientClip[]
  reason: string
}

/** 校验并返回编排，非法时返回 null。 */
export function parseAmbientProgram(input: unknown): AmbientProgram | null {
  const result = ambientProgramInputSchema.safeParse(input)
  if (!result.success)
    return null

  return {
    clips: result.data.clips.map(item => typeof item === 'string' ? { name: item } : item),
    reason: result.data.reason,
  }
}

/** 所有长动作保持时长之和；短片不计时。 */
export function totalHoldMs(clips: AmbientClip[]): number {
  return clips.reduce((sum, clip) => sum + (clip.durationMs ?? 0), 0)
}

/** 当前时间应落在序列的哪个动作。 */
export interface AmbientPosition {
  clipIndex: number
  /** 从该动作内部恢复时，长动作剩余的保持时长。 */
  holdMs?: number
}

/**
 * 按生成时间把当前时刻换算成动作位置。
 *
 * 只累计长动作保持时间；短片不计时，恢复时跳过当前保持之前的短片。
 * 刚开始或总时长为 0 时从第一个动作播放。
 */
export function ambientClipAt(
  program: AmbientProgram,
  anchorAt: number,
  now = Date.now(),
): AmbientPosition {
  const total = totalHoldMs(program.clips)
  if (!total || !program.clips.length)
    return { clipIndex: 0 }

  const elapsed = Math.max(0, now - anchorAt)
  // 刚生成时从头播放，包含开头的短片。
  if (elapsed < 1000)
    return { clipIndex: 0 }

  let offset = elapsed % total
  if (offset === 0)
    return { clipIndex: 0 }

  for (let index = 0; index < program.clips.length; index++) {
    const clip = program.clips[index]
    if (!clip.durationMs)
      continue
    if (offset < clip.durationMs)
      return { clipIndex: index, holdMs: clip.durationMs - offset }
    offset -= clip.durationMs
  }

  return { clipIndex: 0 }
}

/**
 * 表演片段目录：把素材转成模型可读的名称。
 *
 * 模型只看到文件名，不接触路径。长动作按 start / loop / end 三段识别。
 */

import type { CharacterClip, CharacterDefinition } from './types'

/** 长动作未指定保持时长时的缺省值，与原项目 defaultDurationMs 一致。 */
export const DEFAULT_LONG_HOLD_MS = 60_000

/** 一条对话表演步骤：短片名，或带保持时长的长动作名。 */
export interface PerformanceStep {
  name: string
  /** 长动作 loop 的保持时长，毫秒；短片段忽略。 */
  durationMs?: number
}

const LONG_SUFFIX = /-(start|loop|end)$/

function fileStem(segment: string): string {
  const file = segment.split('/').pop() ?? segment
  return file.replace(/\.\w+$/, '')
}

/** 片段展示名：第一个文件的名称，去掉长动作后缀。 */
export function clipDisplayName(clip: CharacterClip): string {
  return fileStem(clip.segments[0] ?? '').replace(LONG_SUFFIX, '')
}

/** 长动作：至少三段，且首尾以 start / end 结尾。 */
export function isLongAction(clip: CharacterClip): boolean {
  if (clip.segments.length !== 3)
    return false

  return /-start\.\w+$/.test(clip.segments[0])
    && /-loop\.\w+$/.test(clip.segments[1])
    && /-end\.\w+$/.test(clip.segments[2])
}

function allActionClips(character: CharacterDefinition): CharacterClip[] {
  return [
    ...character.states.idle,
    ...character.states.petted,
    ...character.pools.emotion,
    ...character.pools.actions,
  ]
}

/** 对话表演候选：按名称去重，保留第一次出现的片段。 */
export function performCandidates(character: CharacterDefinition): Map<string, CharacterClip> {
  const map = new Map<string, CharacterClip>()
  for (const clip of allActionClips(character)) {
    const name = clipDisplayName(clip)
    if (!map.has(name))
      map.set(name, clip)
  }

  return map
}

/** 模型可选的片段名列表。 */
export function performNames(character: CharacterDefinition): string[] {
  return [...performCandidates(character).keys()]
}

/** 按名称取片段，不存在时返回 null。 */
export function resolvePerformClip(character: CharacterDefinition, name: string): CharacterClip | null {
  return performCandidates(character).get(name) ?? null
}

/** 长动作清单，模型用于环境编排。 */
export function longActions(character: CharacterDefinition): { name: string, clip: CharacterClip }[] {
  const seen = new Set<string>()
  const result: { name: string, clip: CharacterClip }[] = []

  for (const clip of character.pools.actions) {
    if (!isLongAction(clip))
      continue

    const name = clipDisplayName(clip)
    if (seen.has(name))
      continue

    seen.add(name)
    result.push({ name, clip })
  }

  return result
}

/** 开场短片：单段、非循环、非长动作。 */
export function entryCandidates(character: CharacterDefinition): Map<string, CharacterClip> {
  const map = new Map<string, CharacterClip>()
  for (const clip of allActionClips(character)) {
    if (clip.segments.length !== 1 || clip.loop || isLongAction(clip))
      continue

    const name = clipDisplayName(clip)
    if (!map.has(name))
      map.set(name, clip)
  }

  return map
}

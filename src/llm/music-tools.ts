/**
 * 音乐工具：弹琴与唱歌。
 *
 * 两者共用 `audio/performance` 的合成与打断管线，这里只负责把模型的选择
 * 翻译成曲谱并启动演奏。工具立即返回，演奏在后台继续，不阻塞回复。
 */

import { tool } from 'langchain'
import { z } from 'zod'

import { playScore } from '@/audio/performance'
import { findScore, PIANO_SCORES, scoreDuration, scoreTitles, SING_SCORES } from '@/audio/score'
import type { AgentTool } from '@/mcp/tools'
import { stopSpeaking } from '@/speech/tts'

/** 演奏前的准备：先打断朗读，避免两种声音叠在一起。 */
function prepareAudio(): void {
  stopSpeaking()
}

function formatDuration(seconds: number): string {
  return `${Math.round(seconds)} 秒`
}

/** 弹琴：按内置曲谱用合成器演奏。 */
export function pianoTool(): AgentTool {
  return tool(
    async ({ piece }) => {
      const score = findScore(PIANO_SCORES, piece) ?? PIANO_SCORES[0]
      prepareAudio()
      const started = playScore(score, 'piano')
      if (!started)
        return '当前环境无法播放声音'

      return `开始弹奏《${score.title}》，大约 ${formatDuration(scoreDuration(score))}，琴键会跟着亮起。`
    },
    {
      name: 'play_piano',
      description: `给主人弹一段钢琴。可选曲目：${scoreTitles(PIANO_SCORES)}。主人点播时挑对应曲目。`,
      schema: z.object({
        piece: z.string().describe(`曲目名，可选：${scoreTitles(PIANO_SCORES)}`),
      }),
    },
  )
}

/** 唱歌：同一套合成管线换成人声音色，并显示歌词。 */
export function singingTool(): AgentTool {
  return tool(
    async ({ song }) => {
      const score = findScore(SING_SCORES, song) ?? SING_SCORES[0]
      prepareAudio()
      const started = playScore(score, 'sing')
      if (!started)
        return '当前环境无法播放声音'

      return `开始唱《${score.title}》，大约 ${formatDuration(scoreDuration(score))}，歌词会显示在聊天里。`
    },
    {
      name: 'sing',
      description: `给主人唱一首歌。可选曲目：${scoreTitles(SING_SCORES)}。主人点歌时挑对应曲目。`,
      schema: z.object({
        song: z.string().describe(`歌名，可选：${scoreTitles(SING_SCORES)}`),
      }),
    },
  )
}

/**
 * 演奏视图：弹琴时显示琴键高亮，唱歌时同时显示歌词。
 *
 * 只读 `usePlaybackStore`，不含播放逻辑；音频由 `audio/performance` 驱动。
 */

import { stopPerformance } from '@/audio/performance'
import { usePlaybackStore } from '@/audio/playback-store'

const OCTAVES = [3, 4, 5]
const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
/** 白键右侧是否跟一个黑键。 */
const BLACK_AFTER: Record<string, string> = {
  C: 'C#',
  D: 'D#',
  F: 'F#',
  G: 'G#',
  A: 'A#',
}

interface WhiteKey {
  id: string
}

interface BlackKey {
  id: string
  /** 左侧位置百分比。 */
  left: number
}

const { whites, blacks, blackWidth } = buildKeyboard()

function buildKeyboard(): { whites: WhiteKey[], blacks: BlackKey[], blackWidth: number } {
  const whiteKeys: WhiteKey[] = []
  const blackKeys: BlackKey[] = []
  const total = OCTAVES.length * WHITE_NAMES.length
  const width = 100 / total

  OCTAVES.forEach((octave) => {
    WHITE_NAMES.forEach((name) => {
      whiteKeys.push({ id: `${name}${octave}` })
      const black = BLACK_AFTER[name]
      if (!black)
        return

      const globalIndex = whiteKeys.length - 1
      // 黑键右侧贴住下一个白键的起点，向左偏移半个黑键宽度居中。
      blackKeys.push({ id: `${black}${octave}`, left: (globalIndex + 1) * width - (width * 0.62) / 2 })
    })
  })

  return { whites: whiteKeys, blacks: blackKeys, blackWidth: width * 0.62 }
}

export function InstrumentView() {
  const active = usePlaybackStore(state => state.active)
  const mode = usePlaybackStore(state => state.mode)
  const title = usePlaybackStore(state => state.title)
  const keyId = usePlaybackStore(state => state.keyId)
  const lyric = usePlaybackStore(state => state.lyric)

  if (!active)
    return null

  const label = mode === 'piano' ? '弹琴' : '唱歌'

  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {label}
          {' · '}
          {title}
        </span>
        <button type="button" className="transition-colors hover:text-foreground" onClick={stopPerformance}>
          停止
        </button>
      </div>

      {mode === 'sing' && lyric
        ? <p className="mt-2 text-center text-sm font-medium">{lyric}</p>
        : null}

      <div className="relative mt-2 h-14 select-none">
        <div className="flex h-full gap-px">
          {whites.map(key => (
            <div
              key={key.id}
              className={`flex-1 rounded-b-md border border-border transition-colors ${
                key.id === keyId ? 'bg-primary' : 'bg-background'
              }`}
            />
          ))}
        </div>
        {blacks.map(key => (
          <div
            key={key.id}
            style={{ left: `${key.left}%`, width: `${blackWidth}%` }}
            className={`absolute top-0 h-[60%] rounded-b-sm border border-border transition-colors ${
              key.id === keyId ? 'bg-primary' : 'bg-foreground'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 表演播放状态：驱动琴键高亮与歌词字幕。
 *
 * 只是一份运行时快照，不持久化：窗口刷新后不应该继续“正在演奏”。
 */

import { create } from 'zustand'

export type PlaybackMode = 'piano' | 'sing'

interface PlaybackState {
  active: boolean
  mode: PlaybackMode | null
  title: string
  /** 当前音符的键盘标识，例如 C4。 */
  keyId: string | null
  /** 当前歌词行；弹琴时为 null。 */
  lyric: string | null
  begin: (mode: PlaybackMode, title: string) => void
  highlight: (keyId: string | null, lyric: string | null) => void
  finish: () => void
}

const IDLE = {
  active: false,
  mode: null as PlaybackMode | null,
  title: '',
  keyId: null as string | null,
  lyric: null as string | null,
}

export const usePlaybackStore = create<PlaybackState>()(set => ({
  ...IDLE,
  begin: (mode, title) => set({ active: true, mode, title, keyId: null, lyric: null }),
  highlight: (keyId, lyric) => set({ keyId, lyric }),
  finish: () => set(IDLE),
}))

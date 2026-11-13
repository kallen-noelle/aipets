/**
 * 曲谱：弹琴与唱歌共用的音符数据。
 *
 * 记法沿用简谱：`1`–`7` 对应 do–si，后缀 `'` 升高一个八度、`,` 降低一个八度。
 * 数据是纯 JSON，之后要做曲谱导入时直接沿用这套结构。
 */

/** 一个音符：简谱音名与持续拍数。 */
export interface ScoreNote {
  pitch: string
  beats: number
}

/** 一句歌词从第几个音符开始显示。 */
export interface ScoreLyricLine {
  at: number
  text: string
}

export interface Score {
  id: string
  title: string
  /** 每分钟拍数，决定播放速度。 */
  bpm: number
  notes: ScoreNote[]
  /** 唱歌用的歌词；弹琴曲谱不填。 */
  lyrics?: ScoreLyricLine[]
}

/** 简谱数字到半音的映射。 */
const SEMITONES: Record<string, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

interface ParsedPitch {
  /** 音名，例如 C / C#。 */
  name: string
  /** 八度，基准 4 表示中央 C 所在八度。 */
  octave: number
}

/** 解析简谱音名，非法输入返回 null。 */
export function parsePitch(pitch: string): ParsedPitch | null {
  const match = /^([1-7])([',]*)$/.exec(pitch.trim())
  if (!match)
    return null

  const degree = Number(match[1])
  const marks = match[2] ?? ''
  const shift = (marks.match(/'/g)?.length ?? 0) - (marks.match(/,/g)?.length ?? 0)
  const semitone = SEMITONES[degree]
  const noteIndex = semitone % 12
  // `1` 从 C 起算，音名直接由半音数决定。
  return { name: NOTE_NAMES[noteIndex], octave: 4 + shift + Math.floor(semitone / 12) }
}

/** 简谱音名转频率，基准 A4 = 440Hz。非法音名返回 null。 */
export function pitchToFrequency(pitch: string): number | null {
  const parsed = parsePitch(pitch)
  if (!parsed)
    return null

  const semitone = NOTE_NAMES.indexOf(parsed.name as typeof NOTE_NAMES[number])
  const midi = (parsed.octave + 1) * 12 + semitone
  return 440 * 2 ** ((midi - 69) / 12)
}

/** 简谱音名对应的键盘标识，例如 `1'` → `C5`。 */
export function pitchToKeyId(pitch: string): string | null {
  const parsed = parsePitch(pitch)
  return parsed ? `${parsed.name}${parsed.octave}` : null
}

/** 一拍对应的秒数。 */
export function beatSeconds(bpm: number): number {
  return 60 / Math.max(30, bpm)
}

/** 整首曲子的时长，秒。 */
export function scoreDuration(score: Score): number {
  return score.notes.reduce((total, note) => total + note.beats, 0) * beatSeconds(score.bpm)
}

/** 小星星：最常用的练手曲，弹琴与唱歌都用它。 */
const TWINKLE_NOTES: ScoreNote[] = [
  { pitch: '1', beats: 1 }, { pitch: '1', beats: 1 }, { pitch: '5', beats: 1 }, { pitch: '5', beats: 1 },
  { pitch: '6', beats: 1 }, { pitch: '6', beats: 1 }, { pitch: '5', beats: 2 },
  { pitch: '4', beats: 1 }, { pitch: '4', beats: 1 }, { pitch: '3', beats: 1 }, { pitch: '3', beats: 1 },
  { pitch: '2', beats: 1 }, { pitch: '2', beats: 1 }, { pitch: '1', beats: 2 },
  { pitch: '5', beats: 1 }, { pitch: '5', beats: 1 }, { pitch: '4', beats: 1 }, { pitch: '4', beats: 1 },
  { pitch: '3', beats: 1 }, { pitch: '3', beats: 1 }, { pitch: '2', beats: 2 },
  { pitch: '5', beats: 1 }, { pitch: '5', beats: 1 }, { pitch: '4', beats: 1 }, { pitch: '4', beats: 1 },
  { pitch: '3', beats: 1 }, { pitch: '3', beats: 1 }, { pitch: '2', beats: 2 },
  { pitch: '1', beats: 1 }, { pitch: '1', beats: 1 }, { pitch: '5', beats: 1 }, { pitch: '5', beats: 1 },
  { pitch: '6', beats: 1 }, { pitch: '6', beats: 1 }, { pitch: '5', beats: 2 },
  { pitch: '4', beats: 1 }, { pitch: '4', beats: 1 }, { pitch: '3', beats: 1 }, { pitch: '3', beats: 1 },
  { pitch: '2', beats: 1 }, { pitch: '2', beats: 1 }, { pitch: '1', beats: 2 },
]

/** 生日快乐：第二个内置曲目。 */
const BIRTHDAY_NOTES: ScoreNote[] = [
  { pitch: '5,', beats: 0.75 }, { pitch: '5,', beats: 0.25 }, { pitch: '6,', beats: 1 },
  { pitch: '5,', beats: 1 }, { pitch: '1', beats: 1 }, { pitch: '7,', beats: 2 },
  { pitch: '5,', beats: 0.75 }, { pitch: '5,', beats: 0.25 }, { pitch: '6,', beats: 1 },
  { pitch: '5,', beats: 1 }, { pitch: '2', beats: 1 }, { pitch: '1', beats: 2 },
  { pitch: '5,', beats: 0.75 }, { pitch: '5,', beats: 0.25 }, { pitch: '5\'', beats: 1 },
  { pitch: '3', beats: 1 }, { pitch: '1', beats: 1 }, { pitch: '7,', beats: 1 }, { pitch: '6,', beats: 2 },
  { pitch: '4', beats: 0.75 }, { pitch: '4', beats: 0.25 }, { pitch: '3', beats: 1 },
  { pitch: '1', beats: 1 }, { pitch: '2', beats: 1 }, { pitch: '1', beats: 2 },
]

export const PIANO_SCORES: Score[] = [
  { id: 'twinkle', title: '小星星', bpm: 100, notes: TWINKLE_NOTES },
  { id: 'birthday', title: '生日快乐', bpm: 96, notes: BIRTHDAY_NOTES },
]

export const SING_SCORES: Score[] = [
  {
    id: 'twinkle',
    title: '小星星',
    bpm: 92,
    notes: TWINKLE_NOTES,
    lyrics: [
      { at: 0, text: '一闪一闪亮晶晶' },
      { at: 7, text: '满天都是小星星' },
      { at: 14, text: '挂在天上放光明' },
      { at: 21, text: '好像许多小眼睛' },
      { at: 28, text: '一闪一闪亮晶晶' },
      { at: 35, text: '满天都是小星星' },
    ],
  },
  {
    id: 'birthday',
    title: '生日快乐',
    bpm: 90,
    notes: BIRTHDAY_NOTES,
    lyrics: [
      { at: 0, text: '祝你生日快乐' },
      { at: 6, text: '祝你生日快乐' },
      { at: 12, text: '祝你生日快乐' },
      { at: 19, text: '祝你永远快乐' },
    ],
  },
]

/** 按名称找曲谱，支持 id 与标题的包含匹配。 */
export function findScore(scores: Score[], name: string): Score | null {
  const query = name.trim()
  if (!query)
    return null

  return scores.find(score => score.id === query)
    ?? scores.find(score => score.title === query)
    ?? scores.find(score => score.title.includes(query) || query.includes(score.title))
    ?? null
}

/** 曲名列表，用于工具描述。 */
export function scoreTitles(scores: Score[]): string {
  return scores.map(score => score.title).join('、')
}

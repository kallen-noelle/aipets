import { describe, expect, it } from 'vitest'

import {
  clipDisplayName,
  entryCandidates,
  isLongAction,
  longActions,
  performCandidates,
  resolvePerformClip,
} from './perform'
import type { CharacterClip, CharacterDefinition } from './types'

function clip(segment: string, loop = false): CharacterClip {
  return { segments: [segment], weight: 1, loop }
}

const longAction: CharacterClip = {
  segments: [
    'animations/悠闲哼歌-start.webm',
    'animations/悠闲哼歌-loop.webm',
    'animations/悠闲哼歌-end.webm',
  ],
  weight: 1,
  loop: false,
}

const character: CharacterDefinition = {
  id: 'test',
  name: '测试角色',
  roman: 'test',
  role: '',
  description: '',
  accent: '#fff',
  order: 0,
  canvas: { width: 640, height: 360 },
  fadeMs: 180,
  persona: '温柔',
  states: {
    idle: [clip('animations/待机呼吸.webm', true)],
    speaking: [clip('animations/说话.webm', true)],
    thinking: [clip('animations/思考.webm')],
    petted: [clip('animations/点击回应-开心跃动.webm')],
    dragging: [clip('animations/悬浮.webm', true)],
  },
  pools: {
    emotion: [clip('animations/点击回应-开心跃动.webm')],
    actions: [longAction],
  },
}

describe('clipDisplayName', () => {
  it('去掉扩展名与长动作后缀', () => {
    expect(clipDisplayName(clip('animations/待机呼吸.webm'))).toBe('待机呼吸')
    expect(clipDisplayName(longAction)).toBe('悠闲哼歌')
  })
})

describe('isLongAction', () => {
  it('识别 start-loop-end 三段', () => {
    expect(isLongAction(longAction)).toBe(true)
    expect(isLongAction(clip('animations/待机呼吸.webm'))).toBe(false)
  })
})

describe('longActions', () => {
  it('返回可用的长动作', () => {
    expect(longActions(character).map(item => item.name)).toEqual(['悠闲哼歌'])
  })
})

describe('performCandidates', () => {
  it('去重并排除说话、思考与拖拽片段', () => {
    const names = [...performCandidates(character).keys()]
    expect(names).toContain('点击回应-开心跃动')
    expect(names).toContain('悠闲哼歌')
    expect(names).toContain('待机呼吸')
    expect(names).not.toContain('说话')
    expect(names).not.toContain('思考')
    expect(names).not.toContain('悬浮')
  })

  it('按名称取片段', () => {
    expect(resolvePerformClip(character, '悠闲哼歌')).toBe(longAction)
    expect(resolvePerformClip(character, '不存在')).toBeNull()
  })
})

describe('entryCandidates', () => {
  it('排除循环片段与长动作', () => {
    const names = [...entryCandidates(character).keys()]
    expect(names).toContain('点击回应-开心跃动')
    expect(names).not.toContain('待机呼吸')
    expect(names).not.toContain('悠闲哼歌')
  })
})

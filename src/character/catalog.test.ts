/**
 * 资源索引解析的测试。
 *
 * 覆盖合法样本、损坏样本、片段归一与 URL 编码。只测纯函数，不需要浏览器环境。
 */

import { describe, expect, it } from 'vitest'

import { clipUrl, clipsForPool, clipsForState, parseCharactersCatalog } from './catalog'

const validCatalog = {
  schemaVersion: 1,
  characters: [
    {
      id: 'main',
      name: '蓝毛小女仆',
      description: '测试角色',
      accent: '#7dd3fc',
      canvas: { width: 640, height: 360 },
      fadeMs: 180,
      persona: '测试人设',
      states: {
        idle: [{ src: 'animations/待机呼吸休闲.webm', weight: 1, loop: true }],
        speaking: [{ src: 'animations/碎碎念-擦桌碎碎念.webm', weight: 1, loop: true }],
        thinking: [{ src: 'animations/东张西望.webm', weight: 1, loop: true }],
        petted: [{ src: 'animations/点击回应-开心跃动.webm', weight: 1, loop: false }],
        dragging: [{ src: 'animations/被鼠标拖拽悬空反馈.webm', weight: 1, loop: true }],
      },
    },
  ],
}

describe('parseCharactersCatalog', () => {
  it('解析合法索引并补全默认值', () => {
    const catalog = parseCharactersCatalog(validCatalog)
    const character = catalog.characters[0]

    expect(character.states.idle[0].segments).toEqual(['animations/待机呼吸休闲.webm'])
    expect(character.states.idle[0].weight).toBe(1)
    expect(character.states.petted[0].loop).toBe(false)
    // 缺省的播放池补成空数组。
    expect(character.pools.emotion).toEqual([])
    expect(character.pools.actions).toEqual([])
  })

  it('把单段与多段声明统一成 segments', () => {
    const catalog = parseCharactersCatalog({
      schemaVersion: 1,
      characters: [{
        id: 'main',
        name: '测试',
        canvas: { width: 640, height: 360 },
        states: {
          idle: [{ segments: ['a-start.webm', 'a-loop.webm', 'a-end.webm'], loop: false }],
          speaking: [{ src: 'b.webm' }],
        },
      }],
    })

    const idle = catalog.characters[0].states.idle[0]
    expect(idle.segments).toHaveLength(3)
    expect(catalog.characters[0].states.speaking[0].segments).toEqual(['b.webm'])
  })

  it('状态组缺省时补成空数组，不报错', () => {
    const catalog = parseCharactersCatalog({
      schemaVersion: 1,
      characters: [{
        id: 'main',
        name: '测试',
        canvas: { width: 640, height: 360 },
        states: { idle: [{ src: 'a.webm' }] },
      }],
    })

    expect(catalog.characters[0].states.dragging).toEqual([])
    // 空状态回退到待机片段，播放器不会无片可播。
    expect(clipsForState(catalog.characters[0], 'dragging')).toEqual(catalog.characters[0].states.idle)
  })

  it('拒绝缺少 idle 片段的索引', () => {
    const broken = structuredClone(validCatalog) as typeof validCatalog
    broken.characters[0].states.idle = []

    expect(() => parseCharactersCatalog(broken)).toThrow(/idle/)
  })

  it('拒绝缺少 canvas 的索引', () => {
    const broken = structuredClone(validCatalog) as Record<string, unknown>
    delete (broken.characters as Array<Record<string, unknown>>)[0].canvas

    expect(() => parseCharactersCatalog(broken)).toThrow(/资源索引损坏/)
  })

  it('拒绝空角色列表', () => {
    expect(() => parseCharactersCatalog({ schemaVersion: 1, characters: [] }))
      .toThrow(/至少有一个角色/)
  })
})

describe('clipUrl', () => {
  it('对中文路径逐段编码（Electron 协议基地址）', () => {
    expect(clipUrl('main', 'animations/待机呼吸休闲.webm', 'aipets-resource://characters'))
      .toBe('aipets-resource://characters/main/animations/%E5%BE%85%E6%9C%BA%E5%91%BC%E5%90%B8%E4%BC%91%E9%97%B2.webm')
  })

  it('浏览器调试用同样的路径结构，只是换前缀', () => {
    const browserUrl = clipUrl('main', 'animations/待机呼吸休闲.webm', '/characters')
    expect(browserUrl.startsWith('/characters/main/animations/')).toBe(true)
  })

  it('保留路径分隔符', () => {
    const url = clipUrl('main', 'a/b c.webm', '/characters')
    expect(url).toContain('a/b%20c.webm')
  })
})

describe('播放池', () => {
  it('读取情绪与动作池', () => {
    const catalog = parseCharactersCatalog({
      ...validCatalog,
      characters: [{
        ...validCatalog.characters[0],
        pools: {
          emotion: [{ src: 'emotion.webm' }],
          actions: [{ src: 'action.webm' }],
        },
      }],
    })

    const character = catalog.characters[0]
    expect(clipsForPool(character, 'emotion')).toHaveLength(1)
    expect(clipsForPool(character, 'actions')).toHaveLength(1)
  })
})

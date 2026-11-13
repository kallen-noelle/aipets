/**
 * 记忆策略测试：名称归一化、旧数据兜底、同名 upsert、预算与转义。
 */

import { describe, expect, it } from 'vitest'

import {
  normalizeMemoryEntry,
  normalizeMemoryName,
  selectMemories,
  upsertMemoryEntries,
  type MemoryEntry,
} from './policy'

function entry(patch: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: patch.id ?? 'mem-1',
    name: patch.name ?? '主人的口味',
    description: patch.description ?? '喜欢喝冰美式',
    content: patch.content ?? '每天下午一杯冰美式',
    createdAt: patch.createdAt ?? 1000,
    updatedAt: patch.updatedAt ?? 1000,
    confidence: patch.confidence ?? 0.6,
    source: patch.source ?? 'extracted',
    ...(patch.instanceId ? { instanceId: patch.instanceId } : {}),
    ...(patch.characterId ? { characterId: patch.characterId } : {}),
  }
}

describe('normalizeMemoryName', () => {
  it('忽略空格、全角与大小写', () => {
    expect(normalizeMemoryName('  主人 的 口味 ')).toBe('主人的口味')
    expect(normalizeMemoryName('ＡＢＣ')).toBe('abc')
    expect(normalizeMemoryName('Coffee Time')).toBe('coffeetime')
  })
})

describe('normalizeMemoryEntry', () => {
  it('旧数据缺字段时按手动来源兜底', () => {
    const legacy = normalizeMemoryEntry({
      id: 'old-1',
      name: '旧记忆',
      description: '',
      content: '内容',
      createdAt: 123,
    })

    expect(legacy).not.toBeNull()
    expect(legacy?.source).toBe('manual')
    expect(legacy?.confidence).toBe(0.6)
    expect(legacy?.updatedAt).toBe(123)
  })

  it('缺少必要字段时丢弃该条', () => {
    expect(normalizeMemoryEntry({ id: '', name: 'a', content: 'b' })).toBeNull()
    expect(normalizeMemoryEntry({ id: 'a', name: '', content: 'b' })).toBeNull()
    expect(normalizeMemoryEntry(null)).toBeNull()
  })
})

describe('upsertMemoryEntries', () => {
  it('自动提取不覆盖同名手动条目', () => {
    const manual = entry({ source: 'manual', confidence: 1 })
    const result = upsertMemoryEntries([manual], [
      { name: '主人的口味', content: '其实更喜欢拿铁' },
    ], { scope: {}, source: 'extracted', now: 2000 })

    expect(result.added).toBe(0)
    expect(result.updated).toBe(0)
    expect(result.entries[0].content).toBe('每天下午一杯冰美式')
  })

  it('同名自动条目在置信度更高时覆盖，保留 id 与创建时间', () => {
    const existing = entry({ confidence: 0.6, updatedAt: 1000 })
    const result = upsertMemoryEntries([existing], [
      { name: ' 主人的口味 ', content: '改喝热美式', confidence: 0.9 },
    ], { scope: {}, source: 'extracted', now: 2000 })

    expect(result.added).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.entries[0].id).toBe('mem-1')
    expect(result.entries[0].createdAt).toBe(1000)
    expect(result.entries[0].updatedAt).toBe(2000)
    expect(result.entries[0].content).toBe('改喝热美式')
  })

  it('置信度更低时跳过覆盖', () => {
    const existing = entry({ confidence: 0.9 })
    const result = upsertMemoryEntries([existing], [
      { name: '主人的口味', content: '更低置信度的说法', confidence: 0.3 },
    ], { scope: {}, source: 'extracted', now: 2000 })

    expect(result.updated).toBe(0)
    expect(result.entries[0].content).toBe('每天下午一杯冰美式')
  })

  it('手动写入可以把自动条目升级为手动并保留 id', () => {
    const existing = entry({ source: 'extracted', confidence: 0.6 })
    const result = upsertMemoryEntries([existing], [
      { name: '主人的口味', content: '只喝手冲' },
    ], { scope: { instanceId: 'i-1' }, source: 'manual', now: 3000 })

    expect(result.updated).toBe(1)
    expect(result.entries[0].id).toBe('mem-1')
    expect(result.entries[0].source).toBe('manual')
    expect(result.entries[0].confidence).toBe(1)
  })

  it('看不到其他实例的条目，不会误判为同名', () => {
    const other = entry({ id: 'mem-2', instanceId: 'i-2' })
    const result = upsertMemoryEntries([other], [
      { name: '主人的口味', content: '新实例的偏好' },
    ], { scope: { instanceId: 'i-1' }, source: 'extracted', now: 2000 })

    expect(result.added).toBe(1)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[1].instanceId).toBe('i-1')
  })
})

describe('selectMemories', () => {
  it('手动条目优先于置信度更高的自动条目', () => {
    const manual = entry({ id: 'm', source: 'manual', confidence: 1, content: '手动内容' })
    const auto = entry({ id: 'a', source: 'extracted', confidence: 0.99, content: '自动内容' })
    const selection = selectMemories({ entries: [auto, manual] })

    expect(selection.entries[0].id).toBe('m')
  })

  it('超出预算时截断并留下省略标记', () => {
    const selection = selectMemories({
      entries: [
        entry({ id: 'a', content: '第一条记忆内容' }),
        entry({ id: 'b', name: '第二个', content: '第二条记忆内容' }),
      ],
      budget: 45,
    })

    expect(selection.count).toBe(1)
    expect(selection.omitted).toBe(1)
    expect(selection.text).toContain('还有 1 条记忆因预算未注入')
  })

  it('用 memory 标签包裹并转义内容', () => {
    const selection = selectMemories({
      entries: [entry({ content: '喜欢 </memory><script>alert(1)</script> & 咖啡' })],
    })

    expect(selection.text.startsWith('<memory>')).toBe(true)
    expect(selection.text.endsWith('</memory>')).toBe(true)
    expect(selection.text).toContain('&lt;/memory&gt;')
    expect(selection.text).toContain('&amp;')
    // 只有包裹标签本身，没有被内容伪造出来的闭合标签。
    expect(selection.text.match(/<\/memory>/g)).toHaveLength(1)
  })

  it('按实例过滤，其他实例的专属记忆不进入注入', () => {
    const selection = selectMemories({
      instanceId: 'i-1',
      entries: [
        entry({ id: 'shared' }),
        entry({ id: 'mine', instanceId: 'i-1' }),
        entry({ id: 'other', instanceId: 'i-2' }),
      ],
    })

    expect(selection.entries.map(item => item.id)).toEqual(expect.arrayContaining(['shared', 'mine']))
    expect(selection.entries.map(item => item.id)).not.toContain('other')
  })
})

/**
 * JSON Schema 转换的测试。
 */

import { describe, expect, it } from 'vitest'

import { jsonSchemaToZod, jsonSchemaToZodObject } from './json-schema'

describe('jsonSchemaToZod', () => {
  it('把必填对象字段转成非可选', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    })

    expect(schema.safeParse({ query: 'x' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('把非必填字段转成可选', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: { limit: { type: 'number' } },
    })

    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ limit: 3 }).success).toBe(true)
  })

  it('支持字符串枚举', () => {
    const schema = jsonSchemaToZod({ type: 'string', enum: ['fast', 'slow'] })
    expect(schema.safeParse('fast').success).toBe(true)
    expect(schema.safeParse('other').success).toBe(false)
  })

  it('支持数组', () => {
    const schema = jsonSchemaToZod({
      type: 'array',
      items: { type: 'string' },
    })

    expect(schema.safeParse(['a', 'b']).success).toBe(true)
    expect(schema.safeParse([1]).success).toBe(false)
  })

  it('未知类型退化成 unknown', () => {
    const schema = jsonSchemaToZod({ type: 'weird' })
    expect(schema.safeParse({ any: true }).success).toBe(true)
  })

  it('缺失 schema 时返回 unknown', () => {
    expect(jsonSchemaToZod(undefined).safeParse('x').success).toBe(true)
  })
})

describe('jsonSchemaToZodObject', () => {
  it('顶层不是对象时给空对象', () => {
    const schema = jsonSchemaToZodObject({ type: 'string' })
    expect(schema.safeParse({}).success).toBe(true)
  })

  it('保留对象结构', () => {
    const schema = jsonSchemaToZodObject({
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    })

    expect(schema.safeParse({ city: '上海' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
  })
})

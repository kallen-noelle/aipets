/**
 * 把 MCP 工具的 JSON Schema 转成 zod schema。
 *
 * LangChain 的工具定义要求 zod，而 MCP 给的是 JSON Schema。这里只覆盖
 * 常用的几种类型，未知结构一律退化成 unknown，保证工具仍可注册。
 */

import { z } from 'zod'

export interface JsonSchema {
  type?: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
}

/** 转换单个 schema 节点。 */
export function jsonSchemaToZod(schema: JsonSchema | undefined): z.ZodTypeAny {
  if (!schema)
    return z.unknown()

  if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.every(item => typeof item === 'string'))
    return z.enum(schema.enum as [string, ...string[]])

  switch (schema.type) {
    case 'string':
      return z.string()
    case 'integer':
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(jsonSchemaToZod(schema.items))
    case 'object': {
      const shape: Record<string, z.ZodTypeAny> = {}
      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        const field = jsonSchemaToZod(value)
        shape[key] = schema.required?.includes(key) ? field : field.optional()
      }
      return z.object(shape)
    }
    default:
      return z.unknown()
  }
}

/** 工具参数必须是对象，顶层节点缺失时给空对象。 */
export function jsonSchemaToZodObject(schema: JsonSchema | undefined): z.ZodObject<z.ZodRawShape> {
  const converted = jsonSchemaToZod(schema)
  return converted instanceof z.ZodObject ? converted : z.object({})
}

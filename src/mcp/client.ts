/**
 * 轻量 MCP 客户端（HTTP 传输）。
 *
 * 只实现实际用到的三个方法：初始化、列工具、调用工具。响应既可能是普通
 * JSON，也可能是 SSE 流，两种都要能解析。
 */

import axios from 'axios'

import type { JsonSchema } from './json-schema'

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: JsonSchema
}

interface McpResponse {
  payload: Record<string, unknown> | null
  headers: Record<string, unknown>
}

/** 解析 JSON 或 SSE 响应体。 */
function parsePayload(data: unknown, contentType: string | undefined): Record<string, unknown> | null {
  if (data && typeof data === 'object')
    return data as Record<string, unknown>

  if (typeof data !== 'string' || !data.trim())
    return null

  const isSse = (contentType ?? '').includes('text/event-stream')
  if (isSse) {
    const lines = data.split('\n').filter(line => line.startsWith('data:'))
    const last = lines[lines.length - 1]
    if (!last)
      return null

    try {
      return JSON.parse(last.slice(5).trim()) as Record<string, unknown>
    }
    catch {
      return null
    }
  }

  try {
    return JSON.parse(data) as Record<string, unknown>
  }
  catch {
    return null
  }
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error)
    return String((error as { message?: unknown }).message ?? '未知错误')

  return '未知错误'
}

/** 把工具调用结果拼成文本。 */
function extractText(result: unknown): string {
  if (!result || typeof result !== 'object')
    return String(result ?? '')

  const content = (result as { content?: Array<{ text?: unknown }> }).content
  if (Array.isArray(content)) {
    const text = content
      .map(block => typeof block.text === 'string' ? block.text : '')
      .filter(Boolean)
      .join('\n')
    if (text)
      return text
  }

  return JSON.stringify(result)
}

export class McpClient {
  private readonly url: string
  private sessionId: string | null = null
  private nextId = 0

  constructor(url: string) {
    this.url = url
  }

  async initialize(): Promise<void> {
    const { headers } = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'aipets', version: '0.0.0' },
    })

    const session = headers['mcp-session-id']
    if (typeof session === 'string' && session)
      this.sessionId = session

    await this.notify('notifications/initialized')
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const result = await this.call('tools/list', {})
    const tools = (result as { tools?: McpToolDefinition[] } | null)?.tools
    return Array.isArray(tools) ? tools : []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.call('tools/call', { name, arguments: args })
    return extractText(result)
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    const { payload } = await this.request(method, params)
    if (!payload)
      throw new Error('MCP 返回内容无法解析')
    if (payload.error)
      throw new Error(errorText(payload.error))

    return payload.result
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await axios.post(
      this.url,
      { jsonrpc: '2.0', method, params },
      {
        headers: this.buildHeaders(),
        timeout: 10_000,
        responseType: 'text',
        validateStatus: () => true,
      },
    )
  }

  private async request(method: string, params: unknown): Promise<McpResponse> {
    const response = await axios.post(
      this.url,
      { jsonrpc: '2.0', id: ++this.nextId, method, params },
      {
        headers: this.buildHeaders(),
        timeout: 15_000,
        responseType: 'text',
        validateStatus: status => status < 500,
      },
    )

    const payload = parsePayload(response.data, response.headers['content-type'] as string | undefined)
    return {
      payload,
      headers: response.headers as Record<string, unknown>,
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (this.sessionId)
      headers['mcp-session-id'] = this.sessionId

    return headers
  }
}

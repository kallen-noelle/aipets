/**
 * 模型输出的文本与 JSON 解析。
 *
 * 导演与环境编排都只接受一个 JSON 对象，解析失败时返回 null。
 */

export function contentText(content: unknown): string {
  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (part && typeof part === 'object' && 'text' in part)
          return String((part as { text?: unknown }).text ?? '')
        return ''
      })
      .join('')
  }

  return ''
}

/** 从回复里截取第一个完整 JSON 对象。 */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start)
    return null

  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1))
    if (value && typeof value === 'object' && !Array.isArray(value))
      return value as Record<string, unknown>
    return null
  }
  catch {
    return null
  }
}

/**
 * 给模型调用加超时，超时后中止请求。
 *
 * `onError` 用来记录真实失败原因；不传时保持原来的静默兜底行为。
 */
export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  onError?: (error: unknown, timedOut: boolean) => void,
): Promise<T | null> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    return await run(controller.signal)
  }
  catch (error) {
    onError?.(error, timedOut)
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

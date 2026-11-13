/**
 * 日程提醒工具：模型记录一次性提醒。
 *
 * 只负责解析时间与写入本地存储，到点触发交给 `reminder/watcher`。
 */

import { tool } from 'langchain'
import { z } from 'zod'

import { useRemindersStore } from '@/config/domains/reminders'
import type { AgentTool } from '@/mcp/tools'

/** 把参数换算成时间戳；无法解析时返回 null。 */
function resolveTime(inMinutes: number | undefined, at: string | undefined): number | null {
  if (typeof inMinutes === 'number' && Number.isFinite(inMinutes))
    return Date.now() + inMinutes * 60_000

  if (at) {
    const parsed = Date.parse(at)
    if (Number.isFinite(parsed))
      return parsed
  }

  return null
}

function formatTime(at: number): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(at)
}

export function addReminderTool(): AgentTool {
  return tool(
    async ({ text, inMinutes, at }) => {
      const time = resolveTime(inMinutes, at)
      if (time === null)
        return '时间无法解析，请用 inMinutes 表示相对分钟数，或给出 ISO 8601 的 at。'

      const reminder = useRemindersStore.getState().add(text, time)
      return `已记录提醒「${reminder.text}」，时间 ${formatTime(time)}。`
    },
    {
      name: 'add_reminder',
      description: '记录一条一次性日程提醒。相对时间用 inMinutes（例如十分钟后传 10），绝对时间用 at。',
      schema: z.object({
        text: z.string().describe('提醒内容'),
        inMinutes: z.number().min(1).max(60 * 24 * 30).optional().describe('相对现在的分钟数'),
        at: z.string().optional().describe('绝对时间，ISO 8601，例如 2026-11-10T09:00:00+08:00'),
      }),
    },
  )
}

export function listRemindersTool(): AgentTool {
  return tool(
    async () => {
      const items = useRemindersStore.getState().items
        .filter(item => !item.done)
        .sort((a, b) => a.at - b.at)
      if (items.length === 0)
        return '当前没有未完成的提醒。'

      return items
        .map(item => `- ${formatTime(item.at)}：${item.text}${item.firedAt ? '（已提醒）' : ''}`)
        .join('\n')
    },
    {
      name: 'list_reminders',
      description: '列出尚未完成的日程提醒。',
      schema: z.object({}),
    },
  )
}

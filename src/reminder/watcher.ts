/**
 * 提醒轮询：定时检查到点条目，写入当前对话并尝试系统通知。
 *
 * 轮询而不是精确定时器：窗口刷新或跨窗口写入后依然能补发，代价是
 * 最多晚一个检查周期（15 秒）。
 */

import { activeInstance } from '@/config/domains/character'
import { dueReminders, useRemindersStore } from '@/config/domains/reminders'
import { activeSessionFor, useSessionsStore } from '@/config/domains/sessions'

const CHECK_INTERVAL_MS = 15_000

let timer: number | null = null

/** 把提醒写进当前实例的会话，并在允许时弹系统通知。 */
function deliver(text: string): void {
  const instance = activeInstance()
  const session = instance ? activeSessionFor(instance.id) : null
  if (session) {
    useSessionsStore.getState().appendMessage(session.id, {
      role: 'assistant',
      content: `提醒：${text}`,
    })
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
    new Notification('aipets 提醒', { body: text })
}

function check(): void {
  for (const item of dueReminders(Date.now())) {
    useRemindersStore.getState().markFired(item.id)
    deliver(item.text)
  }
}

/** 启动轮询，重复调用只生效一次。 */
export function startReminderWatcher(): void {
  if (typeof window === 'undefined' || timer !== null)
    return

  check()
  timer = window.setInterval(check, CHECK_INTERVAL_MS)
}

/**
 * 日程提醒域：一次性提醒的本地存储。
 *
 * 到点由 `reminder/watcher` 触发，写入对话并尝试系统通知；
 * 这里只负责增删与状态标记。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const reminderSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** 触发时间戳，毫秒。 */
  at: z.number(),
  createdAt: z.number(),
  done: z.boolean(),
  /** 已经提醒过的时间；为空表示还没触发。 */
  firedAt: z.number().nullable(),
})

export type Reminder = z.infer<typeof reminderSchema>

interface RemindersState {
  enabled: boolean
  items: Reminder[]
  update: (patch: Partial<Pick<RemindersState, 'enabled'>>) => void
  add: (text: string, at: number) => Reminder
  remove: (id: string) => void
  markDone: (id: string) => void
  markFired: (id: string) => void
  clearDone: () => void
}

export const useRemindersStore = create<RemindersState>()(
  persist(
    set => ({
      enabled: true,
      items: [],
      update: patch => set(patch),
      add: (text, at) => {
        const reminder: Reminder = {
          id: `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text,
          at,
          createdAt: Date.now(),
          done: false,
          firedAt: null,
        }
        set(state => ({ items: [...state.items, reminder] }))
        return reminder
      },
      remove: id => set(state => ({ items: state.items.filter(item => item.id !== id) })),
      markDone: id => set(state => ({
        items: state.items.map(item => item.id === id ? { ...item, done: true } : item),
      })),
      markFired: id => set(state => ({
        items: state.items.map(item => item.id === id ? { ...item, firedAt: Date.now() } : item),
      })),
      clearDone: () => set(state => ({ items: state.items.filter(item => !item.done) })),
    }),
    persistOptions<RemindersState>('reminders'),
  ),
)

/** 到点且尚未提醒的条目，按时间升序。 */
export function dueReminders(now: number): Reminder[] {
  return useRemindersStore.getState().items
    .filter(item => !item.done && item.firedAt === null && item.at <= now)
    .sort((a, b) => a.at - b.at)
}

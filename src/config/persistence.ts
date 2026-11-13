/**
 * zustand 持久化的统一配置。
 *
 * 每个域独立一个存储键，互不影响；版本号用于将来做迁移。
 * 多个窗口共用同一份 localStorage，写回时用 `syncAcrossWindows` 同步。
 */

import type { StoreApi } from 'zustand/vanilla'
import { createJSONStorage, type PersistOptions, type StateStorage } from 'zustand/middleware'

/** 所有键共用的前缀，避免和浏览器里其他应用的键冲突。 */
export const STORAGE_PREFIX = 'aipets'

/** 正在应用其他窗口的快照时置位，避免写回造成来回同步。 */
let applyingRemote = false

const storage: StateStorage = {
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => {
    if (!applyingRemote)
      localStorage.setItem(key, value)
  },
  removeItem: (key) => {
    if (!applyingRemote)
      localStorage.removeItem(key)
  },
}

export function persistOptions<T, P = T>(
  domain: string,
  version = 1,
  merge?: PersistOptions<T, P>['merge'],
  migrate?: PersistOptions<T, P>['migrate'],
): PersistOptions<T, P> {
  return {
    name: `${STORAGE_PREFIX}:${domain}`,
    version,
    storage: createJSONStorage<P>(() => storage),
    ...(merge ? { merge } : {}),
    ...(migrate ? { migrate } : {}),
  }
}

/**
 * 监听其他窗口或标签页对同一键的写入，并把快照合并进当前 store。
 *
 * `storage` 事件只在别的文档里触发，所以本窗口的写入不会回调自身。
 */
export function syncAcrossWindows<T>(domain: string, store: StoreApi<T>): void {
  if (typeof window === 'undefined')
    return

  window.addEventListener('storage', (event) => {
    if (event.key !== `${STORAGE_PREFIX}:${domain}` || !event.newValue)
      return

    try {
      const parsed = JSON.parse(event.newValue) as { state?: unknown }
      if (!parsed.state || typeof parsed.state !== 'object')
        return

      applyingRemote = true
      try {
        store.setState(parsed.state as Partial<T>)
      }
      finally {
        applyingRemote = false
      }
    }
    catch {
      // 损坏的跨窗口写入直接忽略，保留当前状态。
    }
  })
}

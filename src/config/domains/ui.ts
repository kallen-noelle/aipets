/**
 * 界面域：主题与窗口相关的轻量偏好。
 *
 * 窗口位置与尺寸不在这里，由主进程 JSON 管理。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const themeModes = ['light', 'dark', 'system'] as const
export type ThemeMode = typeof themeModes[number]

export const uiSchema = z.object({
  theme: z.enum(themeModes),
})

interface UiState {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
}

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      // 默认跟随系统，用户可以在系统设置里固定为浅色或深色。
      theme: 'system',
      setTheme: theme => set({ theme }),
    }),
    persistOptions<UiState>('ui'),
  ),
)

/** 系统当前是否处于深色模式。 */
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * 把主题写到根节点。
 *
 * Tailwind 的 dark 变体基于 `.dark` 类，因此这里切换 class；
 * `data-theme` 保留给调试与排查。
 */
export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined')
    return

  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

/** 跟随系统时，系统主题变化后自动重算根节点。返回取消函数。 */
export function watchSystemTheme(): () => void {
  if (typeof window === 'undefined')
    return () => {}

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (useUiStore.getState().theme === 'system')
      applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

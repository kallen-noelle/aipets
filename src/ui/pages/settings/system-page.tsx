/**
 * 系统设置页。
 *
 * 展示运行环境，提供主题切换。窗口位置由主进程管理，这里只读。
 */

import { useEffect, useState } from 'react'

import { applyTheme, useUiStore, type ThemeMode } from '@/config/domains/ui'
import { getDesktopBridge, type DesktopInfo } from '@/desktop/bridge'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

const THEME_OPTIONS: Array<{ value: ThemeMode, label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

export function SystemPage() {
  const theme = useUiStore(state => state.theme)
  const setTheme = useUiStore(state => state.setTheme)
  const [info, setInfo] = useState<DesktopInfo | null>(null)

  useEffect(() => {
    const bridge = getDesktopBridge()
    if (!bridge)
      return

    void bridge.getInfo().then(setInfo)
  }, [])

  const changeTheme = (next: ThemeMode) => {
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="外观">
        <SettingRow label="主题" description="浅色、深色，或跟随系统自动切换">
          <div className="flex gap-1">
            {THEME_OPTIONS.map(option => (
              <Button
                key={option.value}
                size="sm"
                variant={theme === option.value ? 'default' : 'outline'}
                onClick={() => changeTheme(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="运行环境" description="桌面版信息，浏览器调试时不可用。">
        {info
          ? (
              <>
                <SettingRow label="平台">{info.platform}</SettingRow>
                <SettingRow label="Electron">{info.versions.electron}</SettingRow>
                <SettingRow label="Chrome">{info.versions.chrome}</SettingRow>
              </>
            )
          : <p className="text-sm text-muted-foreground">当前在浏览器中运行。</p>}
      </SettingSection>
    </div>
  )
}

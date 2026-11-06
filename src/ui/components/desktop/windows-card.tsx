/**
 * 窗口与托盘：打开、聚焦、关闭次级窗口，并控制关闭进托盘。
 *
 * 窗口列表与偏好都由主进程提供，网页版只显示说明。
 */

import { useEffect, useState } from 'react'

import { getDesktopBridge, type SecondaryWindowItem } from '@/desktop/bridge'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Switch } from '@/ui/components/ui/switch'

const WINDOW_LABELS: Record<string, string> = {
  chat: '聊天',
  settings: '设置',
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

export function WindowsCard() {
  const bridge = getDesktopBridge()
  const [windows, setWindows] = useState<SecondaryWindowItem[]>([])
  const [closeToTray, setCloseToTray] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bridge)
      return

    let disposed = false
    void bridge.listWindows().then((list) => {
      if (!disposed)
        setWindows(list)
    })
    void bridge.getPreferences().then((next) => {
      if (!disposed)
        setCloseToTray(next.closeToTray)
    })

    const offWindows = bridge.onWindowsChanged(setWindows)
    const offPreferences = bridge.onPreferencesChanged(next => setCloseToTray(next.closeToTray))

    return () => {
      disposed = true
      offWindows()
      offPreferences()
    }
  }, [bridge])

  if (!bridge) {
    return (
      <SettingSection title="窗口与托盘" description="窗口能力只在桌面外壳里可用。">
        <p className="text-sm text-muted-foreground">
          网页版没有独立窗口。需要托盘与多窗口时请使用桌面外壳。
        </p>
      </SettingSection>
    )
  }

  const run = async (action: () => Promise<SecondaryWindowItem[]>) => {
    setError(null)
    try {
      setWindows(await action())
    }
    catch (cause) {
      setError(errorText(cause))
    }
  }

  const setTray = async (next: boolean) => {
    setCloseToTray(next)
    setError(null)
    try {
      await bridge.setPreferences({ closeToTray: next })
    }
    catch (cause) {
      setError(errorText(cause))
    }
  }

  const opened = windows.filter(item => item.visible)

  return (
    <SettingSection title="窗口与托盘" description="桌宠与聊天、设置是独立窗口，各自记住位置。">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void run(() => bridge.openWindow('chat'))}>
          打开聊天窗口
        </Button>
        <Button variant="outline" size="sm" onClick={() => void run(() => bridge.openWindow('settings'))}>
          打开设置窗口
        </Button>
      </div>

      <SettingRow label="关闭进托盘" description="关闭窗口后仍在托盘里运行">
        <Switch checked={closeToTray} onCheckedChange={next => void setTray(next)} />
      </SettingRow>

      {opened.length > 0
        ? (
            <div className="space-y-2">
              {opened.map(item => (
                <div key={item.kind} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                  <span className="min-w-12 text-sm font-medium">
                    {WINDOW_LABELS[item.kind] ?? item.kind}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.focused ? '已聚焦' : '已打开'}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void run(async () => {
                        await bridge.focusWindow(item.kind as 'chat' | 'settings')
                        return bridge.listWindows()
                      })}
                    >
                      聚焦
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void run(() => bridge.closeWindow(item.kind as 'chat' | 'settings'))}
                    >
                      关闭
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        : <p className="text-sm text-muted-foreground">没有打开的次级窗口。</p>}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </SettingSection>
  )
}

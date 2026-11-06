/**
 * 插件设置页：安装本地插件文件夹、启停、移除与查看日志。
 *
 * 插件宿主只在桌面外壳里可用；浏览器下显示同一份说明。
 */

import { useEffect, useState } from 'react'

import { getDesktopBridge, type DesktopPlugin } from '@/desktop/bridge'
import { PluginCard } from '@/ui/components/plugin-card'
import { SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

export function PluginsPage() {
  const bridge = getDesktopBridge()
  const [plugins, setPlugins] = useState<DesktopPlugin[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bridge)
      return

    let disposed = false
    void bridge.listPlugins()
      .then((list) => {
        if (!disposed)
          setPlugins(list)
      })
      .catch(cause => !disposed && setError(errorText(cause)))

    return () => {
      disposed = true
    }
  }, [bridge])

  if (!bridge) {
    return (
      <div className="max-w-2xl">
        <SettingSection title="插件" description="本地插件由桌面外壳加载。">
          <p className="text-sm text-muted-foreground">
            网页版不能安装本地插件。需要插件时请使用桌面外壳。
          </p>
        </SettingSection>
      </div>
    )
  }

  const run = async (id: string, action: () => Promise<DesktopPlugin[]>) => {
    setBusyId(id)
    setError(null)
    try {
      setPlugins(await action())
    }
    catch (cause) {
      setError(errorText(cause))
    }
    finally {
      setBusyId(null)
    }
  }

  const install = async () => {
    setInstalling(true)
    setError(null)
    try {
      setPlugins(await bridge.installPlugin())
    }
    catch (cause) {
      setError(errorText(cause))
    }
    finally {
      setInstalling(false)
    }
  }

  const openBinding = async (id: string, moduleId: string) => {
    setError(null)
    try {
      await bridge.openPluginBinding(id, moduleId)
      setPlugins(await bridge.listPlugins())
    }
    catch (cause) {
      setError(errorText(cause))
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection
        title="插件"
        description="插件是带 extension.aipets.json 清单的本地文件夹。"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={installing} onClick={() => void install()}>
            {installing ? '正在安装…' : '安装文件夹'}
          </Button>
          <span className="text-xs text-muted-foreground">安装后默认停用，需要手动启用。</span>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {plugins.length === 0 ? <p className="text-sm text-muted-foreground">还没有安装插件。</p> : null}
      </SettingSection>

      {plugins.map(plugin => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          busy={busyId === plugin.id}
          onToggle={(id, enabled) => void run(id, () => bridge.setPluginEnabled(id, enabled))}
          onRemove={(id) => void run(id, () => bridge.removePlugin(id))}
          onOpenBinding={(id, moduleId) => void openBinding(id, moduleId)}
        />
      ))}
    </div>
  )
}

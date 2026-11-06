/**
 * 插件卡片：启停、移除、打开游戏窗口与查看日志。
 *
 * 组件只渲染与转发事件，状态由插件页管理。
 */

import type { DesktopPlugin } from '@/desktop/bridge'

import { Button } from '@/ui/components/ui/button'
import { SettingSection } from '@/ui/components/setting-section'

export interface PluginCardProps {
  plugin: DesktopPlugin
  busy: boolean
  onToggle: (id: string, enabled: boolean) => void
  onRemove: (id: string) => void
  onOpenBinding: (id: string, moduleId: string) => void
}

export function PluginCard({ plugin, busy, onToggle, onRemove, onOpenBinding }: PluginCardProps) {
  return (
    <SettingSection
      title={`${plugin.name} · ${plugin.version}`}
      description={plugin.description || plugin.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onToggle(plugin.id, !plugin.enabled)}
        >
          {plugin.enabled ? '停用' : '启用'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onRemove(plugin.id)}
        >
          移除
        </Button>
        <span className="text-xs text-muted-foreground">
          {plugin.enabled
            ? (plugin.loaded ? '已启用' : '启用中')
            : '已停用'}
        </span>
      </div>

      {plugin.error ? <p className="text-xs text-destructive">{plugin.error}</p> : null}

      {plugin.bindings.length > 0
        ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold">游戏窗口</h3>
              <div className="flex flex-wrap gap-2">
                {plugin.bindings.map(binding => (
                  <Button
                    key={binding.moduleId}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onOpenBinding(plugin.id, binding.moduleId)}
                  >
                    {binding.title}
                  </Button>
                ))}
              </div>
            </div>
          )
        : null}

      {plugin.logs.length > 0
        ? (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">日志</summary>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {plugin.logs.map(log => (
                  <li key={`${log.at}-${log.message}`}>
                    {new Date(log.at).toLocaleTimeString()}
                    {' · '}
                    {log.level}
                    {' · '}
                    {log.message}
                  </li>
                ))}
              </ul>
            </details>
          )
        : null}
    </SettingSection>
  )
}

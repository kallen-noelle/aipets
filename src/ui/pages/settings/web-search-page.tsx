/**
 * 网络搜索设置页。
 */

import { useWebSearchStore } from '@/config/domains/web-search'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'
import { Switch } from '@/ui/components/ui/switch'

export function WebSearchPage() {
  const config = useWebSearchStore()
  const update = useWebSearchStore(state => state.update)

  return (
    <div className="max-w-2xl">
      <SettingSection title="网络搜索" description="启用后模型可以调用 Tavily 搜索。">
        <SettingRow label="启用搜索">
          <Switch checked={config.enabled} onCheckedChange={enabled => update({ enabled })} />
        </SettingRow>

        <SettingRow label="Tavily 密钥">
          <Input
            type="password"
            value={config.apiKey}
            placeholder="tvly-..."
            onChange={event => update({ apiKey: event.target.value })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

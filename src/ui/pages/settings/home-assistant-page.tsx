/**
 * 家庭助手设置页。
 */

import { useHomeAssistantStore } from '@/config/domains/home-assistant'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'
import { Switch } from '@/ui/components/ui/switch'

export function HomeAssistantPage() {
  const config = useHomeAssistantStore()
  const update = useHomeAssistantStore(state => state.update)

  return (
    <div className="max-w-2xl">
      <SettingSection title="家庭助手" description="接入 Home Assistant 的设备与服务。">
        <SettingRow label="启用">
          <Switch checked={config.enabled} onCheckedChange={enabled => update({ enabled })} />
        </SettingRow>

        <SettingRow label="实例地址">
          <Input
            value={config.baseUrl}
            placeholder="http://homeassistant.local:8123"
            onChange={event => update({ baseUrl: event.target.value })}
          />
        </SettingRow>

        <SettingRow label="访问令牌">
          <Input
            type="password"
            value={config.token}
            onChange={event => update({ token: event.target.value })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

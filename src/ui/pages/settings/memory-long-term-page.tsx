/**
 * 长期记忆设置页：开关与两个子页入口。
 */

import { Link } from 'react-router'

import { useMemoryStore } from '@/config/domains/memory'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Switch } from '@/ui/components/ui/switch'

export function MemoryLongTermPage() {
  const enabled = useMemoryStore(state => state.longTermEnabled)
  const update = useMemoryStore(state => state.updateSettings)
  const count = useMemoryStore(state => state.entries.length)

  return (
    <div className="max-w-2xl">
      <SettingSection title="长期记忆" description="记住主人的偏好与设定，并注入系统提示词。">
        <SettingRow label="启用长期记忆">
          <Switch checked={enabled} onCheckedChange={longTermEnabled => update({ longTermEnabled })} />
        </SettingRow>

        <SettingRow label="记忆条目" description={`已保存 ${count} 条`}>
          <Link className="text-sm text-primary" to="/settings/modules/memory-long-term/memories">
            管理记忆
          </Link>
        </SettingRow>

        <SettingRow label="提示词配方" description="附加到系统提示词">
          <Link className="text-sm text-primary" to="/settings/modules/memory-long-term/recipes">
            管理配方
          </Link>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

/**
 * 短期记忆设置页：历史消息开关与窗口。
 */

import { useMemoryStore } from '@/config/domains/memory'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'
import { Switch } from '@/ui/components/ui/switch'

export function MemoryShortTermPage() {
  const enabled = useMemoryStore(state => state.shortTermEnabled)
  const windowSize = useMemoryStore(state => state.shortTermWindow)
  const update = useMemoryStore(state => state.updateSettings)

  return (
    <div className="max-w-2xl">
      <SettingSection title="短期记忆" description="每轮对话最多带多少条历史消息。">
        <SettingRow label="发送对话历史">
          <Switch checked={enabled} onCheckedChange={shortTermEnabled => update({ shortTermEnabled })} />
        </SettingRow>

        <SettingRow label="保留消息数" description="2 到 50">
          <Input
            type="number"
            min={2}
            max={50}
            value={windowSize}
            onChange={event => update({ shortTermWindow: Number(event.target.value) || 12 })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

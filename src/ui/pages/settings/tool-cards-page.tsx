/**
 * 工具卡片设置页。
 */

import { useToolCardsStore } from '@/config/domains/tool-cards'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Switch } from '@/ui/components/ui/switch'

export function ToolCardsPage() {
  const config = useToolCardsStore()
  const update = useToolCardsStore(state => state.update)

  return (
    <div className="max-w-2xl">
      <SettingSection title="工具卡片" description="控制工具调用结果如何显示。">
        <SettingRow label="显示工具结果卡片">
          <Switch checked={config.enabled} onCheckedChange={enabled => update({ enabled })} />
        </SettingRow>

        <SettingRow label="回复内绘制卡片">
          <Switch checked={config.replyCards} onCheckedChange={replyCards => update({ replyCards })} />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

/**
 * 声纹设置页。
 */

import { useHearingStore } from '@/config/domains/hearing'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Switch } from '@/ui/components/ui/switch'

export function VoiceprintPage() {
  const config = useHearingStore()

  return (
    <div className="max-w-2xl">
      <SettingSection title="声纹" description="需要声纹模型；当前版本不加载该模型。">
        <SettingRow label="启用声纹">
          <Switch checked={config.voiceprintEnabled} disabled />
        </SettingRow>

        <SettingRow label="登记状态" description="尚未登记声纹">
          <Button variant="outline" disabled>删除声纹</Button>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

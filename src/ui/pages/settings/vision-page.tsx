/**
 * 视觉设置页：图片理解使用的提供商与模型。
 */

import { useProvidersStore } from '@/config/domains/providers'
import { useVisionStore } from '@/config/domains/vision'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'
import { Switch } from '@/ui/components/ui/switch'

export function VisionPage() {
  const config = useVisionStore()
  const update = useVisionStore(state => state.update)
  const providers = useProvidersStore(state => state.items)
    .filter(provider => provider.capabilities.includes('chat'))

  return (
    <div className="max-w-2xl">
      <SettingSection title="视觉" description="带图片的对话改用视觉模型。">
        <SettingRow label="提供商">
          <Select
            value={config.providerId || 'active'}
            onValueChange={value => update({ providerId: value === 'active' ? '' : value })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">激活提供商</SelectItem>
              {providers.map(provider => (
                <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="视觉模型">
          <Input
            value={config.model}
            placeholder="例如 gpt-4o-mini"
            onChange={event => update({ model: event.target.value })}
          />
        </SettingRow>

        <SettingRow label="带图轮次改用视觉模型">
          <Switch checked={config.useForChat} onCheckedChange={useForChat => update({ useForChat })} />
        </SettingRow>

        <SettingRow label="工具图片改用视觉模型" description="工具返回图片时，本轮改用视觉模型。">
          <Switch
            checked={config.useForToolImages}
            onCheckedChange={useForToolImages => update({ useForToolImages })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

/**
 * 转写与改写设置页。
 *
 * 转写提供商与「转写」用途的激活项共用同一份配置；改写使用对话模型。
 */

import { transcriptionProvider, useProvidersStore } from '@/config/domains/providers'
import { useHearingStore } from '@/config/domains/hearing'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'

export function TranscriberPage() {
  const config = useHearingStore()
  const update = useHearingStore(state => state.update)
  const providers = useProvidersStore(state => state.items)
  const transcriptionId = useProvidersStore(state => state.transcriptionId)
  const setTranscription = useProvidersStore(state => state.setTranscription)

  const speechProviders = providers.filter(item => item.capabilities.includes('transcription'))
  const chatProviders = providers.filter(item => item.capabilities.includes('chat'))

  const activeTranscription = transcriptionProvider()

  return (
    <div className="max-w-2xl">
      <SettingSection title="转写" description="把录音转成文字的接口。">
        <SettingRow
          label="提供商"
          description={transcriptionId ? '已单独指定' : '跟随对话提供商'}
        >
          <Select
            value={transcriptionId || 'active'}
            onValueChange={value => setTranscription(value === 'active' ? '' : value)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">跟随对话提供商</SelectItem>
              {speechProviders.map(provider => (
                <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="模型"
          description={activeTranscription ? activeTranscription.label : '还没有可用的提供商'}
        >
          <Input
            value={config.transcriberModel}
            placeholder="whisper-1"
            onChange={event => update({ transcriberModel: event.target.value })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="改写" description="转写后的文字再交给模型整理。">
        <SettingRow label="提供商">
          <Select
            value={config.rephraseProviderId || 'active'}
            onValueChange={value => update({ rephraseProviderId: value === 'active' ? '' : value })}
          >
            <SelectTrigger><SelectValue placeholder="激活提供商" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">激活提供商</SelectItem>
              {chatProviders.map(provider => (
                <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="模型">
          <Input
            value={config.rephraseModel}
            placeholder="留空则使用转写结果"
            onChange={event => update({ rephraseModel: event.target.value })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

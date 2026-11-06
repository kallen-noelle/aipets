/**
 * 设置总览页。
 *
 * 只读汇总，给出当前配置的一句话状态，方便确认链路是否配好。
 */

import { useProvidersStore } from '@/config/domains/providers'
import { useCharacterStore } from '@/config/domains/character'
import { useChatConfigStore } from '@/config/domains/chat'
import { useMemoryStore } from '@/config/domains/memory'
import { useModelsStore } from '@/config/domains/models'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'

export function OverviewPage() {
  const providers = useProvidersStore(state => state.items)
  const activeId = useProvidersStore(state => state.activeId)
  const provider = providers.find(item => item.id === activeId) ?? providers[0]
  const model = useModelsStore(state => state.selected)
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const temperature = useChatConfigStore(state => state.temperature)
  const memoryCount = useMemoryStore(state => state.entries.length)

  const ready = Boolean(provider?.apiKey) && Boolean(model)

  return (
    <div className="max-w-2xl">
      <SettingSection
        title="对话状态"
        description={ready ? '配置完整，可以开始对话。' : '还缺提供商凭据或模型，先去补上。'}
      >
        <SettingRow label="提供商" description={provider?.baseUrl ?? '未配置'}>
          {provider?.label ?? '未配置'}
        </SettingRow>
        <SettingRow label="模型">{model ?? '未选择'}</SettingRow>
        <SettingRow label="温度">{temperature.toFixed(2)}</SettingRow>
      </SettingSection>

      <SettingSection title="角色与记忆">
        <SettingRow label="角色实例" description={`${instances.length} 个，当前对话：实例 ${instances.findIndex(item => item.id === activeInstanceId) + 1}`}>
          {instances.length}
        </SettingRow>
        <SettingRow label="记忆条目">{memoryCount} 条</SettingRow>
      </SettingSection>
    </div>
  )
}

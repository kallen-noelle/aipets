/**
 * 模型提供商列表。
 *
 * 内置提供商按用途分页签，点卡片即添加；已保存的列表按用途分别启用。
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import {
  providerTaskGroups,
  useProvidersStore,
  type ProviderCapability,
  type ProviderPreset,
} from '@/config/domains/providers'
import { ProviderPresetPicker } from '@/ui/components/provider-preset-picker'
import { SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

const activationLabel: Record<ProviderCapability, string> = {
  chat: '设为对话',
  speech: '设为朗读',
  transcription: '设为转写',
}

/** 用途的中文名，来自分组表。 */
function groupLabel(capability: ProviderCapability): string {
  return providerTaskGroups.find(task => task.id === capability)?.label ?? capability
}

export function ProvidersPage() {
  const navigate = useNavigate()
  const items = useProvidersStore(state => state.items)
  const activeId = useProvidersStore(state => state.activeId)
  const speechId = useProvidersStore(state => state.speechId)
  const transcriptionId = useProvidersStore(state => state.transcriptionId)
  const upsert = useProvidersStore(state => state.upsert)
  const setActive = useProvidersStore(state => state.setActive)
  const setSpeech = useProvidersStore(state => state.setSpeech)
  const setTranscription = useProvidersStore(state => state.setTranscription)
  const [group, setGroup] = useState<ProviderCapability>('chat')

  const activeByGroup: Record<ProviderCapability, string | null> = {
    chat: activeId,
    speech: speechId || null,
    transcription: transcriptionId || null,
  }

  const activate = (capability: ProviderCapability, id: string) => {
    if (capability === 'speech')
      setSpeech(id)
    else if (capability === 'transcription')
      setTranscription(id)
    else
      setActive(id)
  }

  /** 已保存过的预置直接打开，新预置添加后进入详情页补 Key。 */
  const openPreset = (preset: ProviderPreset) => {
    const existing = items.find(item => item.baseUrl === preset.baseUrl)
    if (existing) {
      navigate(`/settings/providers/${existing.id}`)
      return
    }

    const id = `${preset.id}-${Date.now()}`
    upsert({
      id,
      label: preset.label,
      baseUrl: preset.baseUrl,
      apiKey: '',
      capabilities: preset.capabilities,
    })
    navigate(`/settings/providers/${id}`)
  }

  const filtered = items.filter(item => item.capabilities.includes(group))

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex gap-1 border-b pb-2">
        {providerTaskGroups.map(task => (
          <Button
            key={task.id}
            size="sm"
            variant={task.id === group ? 'default' : 'ghost'}
            onClick={() => setGroup(task.id)}
          >
            {task.label}
          </Button>
        ))}
      </div>

      <SettingSection title="内置提供商" description="地址与用途已内置，点开补 Key 即可。">
        <ProviderPresetPicker capability={group} providers={items} onOpen={openPreset} />
      </SettingSection>

      <SettingSection title="已保存" description="按用途分别启用，对话与语音可以各用一家。">
        {filtered.length === 0
          ? <p className="text-sm text-muted-foreground">这个用途还没有提供商。</p>
          : filtered.map(provider => (
              <div key={provider.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{provider.label}</span>
                    {provider.id === activeByGroup[group]
                      ? <span className="text-xs text-primary">{groupLabel(group)}使用中</span>
                      : null}
                    {provider.apiKey
                      ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600">
                            已配置
                          </span>
                        )
                      : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{provider.baseUrl}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={provider.id === activeByGroup[group]}
                    onClick={() => activate(group, provider.id)}
                  >
                    {activationLabel[group]}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/settings/providers/${provider.id}`}>详情</Link>
                  </Button>
                </div>
              </div>
            ))}
      </SettingSection>
    </div>
  )
}

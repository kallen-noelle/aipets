/**
 * 提供商详情页：编辑单个提供商、设置用途并试听语音。
 */

import { useState } from 'react'
import { useParams } from 'react-router'

import {
  providerTaskGroups,
  useProvidersStore,
  type ProviderCapability,
} from '@/config/domains/providers'
import { synthesize } from '@/speech/tts'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Switch } from '@/ui/components/ui/switch'

const PREVIEW_TEXT = '你好，我是你的桌面伙伴。'

export function ProviderDetailPage() {
  const { providerId } = useParams()
  const items = useProvidersStore(state => state.items)
  const activeId = useProvidersStore(state => state.activeId)
  const speechId = useProvidersStore(state => state.speechId)
  const transcriptionId = useProvidersStore(state => state.transcriptionId)
  const upsert = useProvidersStore(state => state.upsert)
  const remove = useProvidersStore(state => state.remove)
  const setActive = useProvidersStore(state => state.setActive)
  const setSpeech = useProvidersStore(state => state.setSpeech)
  const setTranscription = useProvidersStore(state => state.setTranscription)

  const [previewing, setPreviewing] = useState(false)
  const [previewMessage, setPreviewMessage] = useState<string | null>(null)

  const provider = items.find(item => item.id === providerId)
  if (!provider) {
    return <p className="text-sm text-muted-foreground">提供商不存在，可能已被删除。</p>
  }

  const patch = (patchValue: Partial<typeof provider>) => upsert({ ...provider, ...patchValue })

  const toggleCapability = (capability: ProviderCapability, enabled: boolean) => {
    const next = enabled
      ? [...provider.capabilities, capability]
      : provider.capabilities.filter(item => item !== capability)
    // 至少保留一种用途，否则提供商不会出现在任何列表里。
    if (next.length === 0)
      return

    patch({ capabilities: next })
  }

  const activator: Record<ProviderCapability, () => void> = {
    chat: () => setActive(provider.id),
    speech: () => setSpeech(provider.id),
    transcription: () => setTranscription(provider.id),
  }

  const isActive = (capability: ProviderCapability) => {
    if (capability === 'speech')
      return speechId === provider.id
    if (capability === 'transcription')
      return transcriptionId === provider.id

    return activeId === provider.id
  }

  const preview = async () => {
    setPreviewMessage(null)
    setPreviewing(true)
    try {
      const blob = await synthesize(PREVIEW_TEXT, provider.id)
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
      await audio.play()
      setPreviewMessage('已开始播放')
    }
    catch {
      setPreviewMessage('试听失败，请检查地址与 Key')
    }
    finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title={provider.label} description="修改后立即写入 providers 域。">
        <SettingRow label="名称">
          <Input value={provider.label} onChange={event => patch({ label: event.target.value })} />
        </SettingRow>

        <SettingRow label="接口地址" description="由提供商内置，不需要修改。">
          <span className="max-w-64 truncate text-xs text-muted-foreground">{provider.baseUrl}</span>
        </SettingRow>

        <SettingRow label="API Key">
          <Input
            type="password"
            value={provider.apiKey}
            placeholder="本地服务可以留空"
            onChange={event => patch({ apiKey: event.target.value })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="用途" description="决定提供商出现在哪些设置页的选择列表。">
        {providerTaskGroups.map(task => (
          <SettingRow key={task.id} label={task.label}>
            <Switch
              checked={provider.capabilities.includes(task.id)}
              onCheckedChange={enabled => toggleCapability(task.id, enabled)}
            />
          </SettingRow>
        ))}
      </SettingSection>

      <SettingSection title="按用途激活" description="对话与语音各用各的提供商。">
        {providerTaskGroups
          .filter(task => provider.capabilities.includes(task.id))
          .map(task => (
            <SettingRow key={task.id} label={task.label}>
              <Button
                size="sm"
                variant={isActive(task.id) ? 'secondary' : 'default'}
                onClick={activator[task.id]}
              >
                {isActive(task.id) ? '使用中' : '启用'}
              </Button>
            </SettingRow>
          ))}
      </SettingSection>

      {provider.capabilities.includes('speech')
        ? (
            <SettingSection title="语音试听" description="用当前表单里的地址与 Key 合成一句。">
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={previewing} onClick={() => void preview()}>
                  {previewing ? '播放中…' : '试听'}
                </Button>
                {previewMessage ? <p className="text-xs text-muted-foreground">{previewMessage}</p> : null}
              </div>
            </SettingSection>
          )
        : null}

      <div className="flex items-center gap-2 px-1">
        <Button
          variant="outline"
          onClick={() => {
            if (window.confirm(`删除提供商 ${provider.label} 吗？`))
              remove(provider.id)
          }}
        >
          删除
        </Button>
      </div>
    </div>
  )
}

/**
 * 角色实例管理：增删实例、启停显示、设置当前对话实例与实例外观。
 *
 * 对齐原项目：实例列表在模型页，外观按实例独立配置。
 */

import { useEffect, useState } from 'react'

import { loadCharactersCatalog } from '@/character/catalog'
import type { CharacterDefinition } from '@/character/types'
import { useCardStore } from '@/config/domains/card'
import { useCharacterStore, type CharacterInstance } from '@/config/domains/character'
import { useSessionsStore } from '@/config/domains/sessions'
import { CharacterPicker } from '@/ui/components/character-picker'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Slider } from '@/ui/components/ui/slider'
import { Switch } from '@/ui/components/ui/switch'

export function InstanceManager() {
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const addInstance = useCharacterStore(state => state.addInstance)
  const updateInstance = useCharacterStore(state => state.updateInstance)
  const removeInstance = useCharacterStore(state => state.removeInstance)
  const setActiveInstance = useCharacterStore(state => state.setActiveInstance)
  const [characters, setCharacters] = useState<CharacterDefinition[]>([])
  /** 待确认删除的实例；用页面内确认，避免原生 confirm 在部分内嵌预览里卡住。 */
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    void loadCharactersCatalog().then((catalog) => {
      if (!disposed)
        setCharacters(catalog.characters)
    })

    return () => {
      disposed = true
    }
  }, [])

  const active = instances.find(item => item.id === activeInstanceId) ?? instances[0]
  const label = (instance: CharacterInstance, number: number): string =>
    `${number}. ${characters.find(item => item.id === instance.characterId)?.name ?? instance.characterId}`

  const remove = (instanceId: string) => {
    removeInstance(instanceId)
    useCardStore.getState().resetChat(instanceId)
    useSessionsStore.getState().clearInstanceSessions(instanceId)
    setRemovingId(null)
  }

  const patchAppearance = (patch: Partial<CharacterInstance['appearance']>) => {
    if (!active)
      return

    updateInstance(active.id, { appearance: { ...active.appearance, ...patch } })
  }

  return (
    <>
      <SettingSection title="角色实例" description="每个实例独立显示，并拥有自己的会话与聊天设置。">
        <div className="flex flex-col gap-2">
          {instances.map((instance, index) => (
            <div
              key={instance.id}
              className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
                instance.id === active?.id ? 'border-primary bg-primary/5' : ''
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{label(instance, index + 1)}</span>
              {instance.id === active?.id
                ? <span className="text-xs text-primary">对话中</span>
                : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setActiveInstance(instance.id)}
                    >
                      设为对话
                    </Button>
                  )}
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                显示
                <Switch
                  checked={instance.enabled}
                  onCheckedChange={enabled => updateInstance(instance.id, { enabled })}
                />
              </label>
              {removingId === instance.id
                ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => remove(instance.id)}
                      >
                        确认删除
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemovingId(null)}
                      >
                        取消
                      </Button>
                    </>
                  )
                : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={instances.length <= 1}
                      onClick={() => setRemovingId(instance.id)}
                    >
                      删除
                    </Button>
                  )}
            </div>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="添加角色" description="点击角色添加一个实例，同一角色可以添加多次。">
        {characters.length > 0
          ? (
              <CharacterPicker
                characters={characters}
                activeId={active?.characterId ?? ''}
                onSelect={characterId => addInstance(characterId)}
              />
            )
          : <p className="text-sm text-muted-foreground">正在读取角色资源…</p>}
      </SettingSection>

      <SettingSection title="实例外观" description="只影响当前对话实例。">
        {active
          ? (
              <>
                <SettingRow label="缩放" description={`${active.appearance.scale.toFixed(2)} 倍`}>
                  <Slider
                    min={0.4}
                    max={3}
                    step={0.05}
                    value={[active.appearance.scale]}
                    onValueChange={([scale]) => patchAppearance({ scale })}
                  />
                </SettingRow>

                <SettingRow label="淡入时长" description={`${active.appearance.fadeMs} 毫秒`}>
                  <Slider
                    min={0}
                    max={1200}
                    step={20}
                    value={[active.appearance.fadeMs]}
                    onValueChange={([fadeMs]) => patchAppearance({ fadeMs })}
                  />
                </SettingRow>

                <SettingRow label="水平镜像">
                  <Switch
                    checked={active.appearance.mirror}
                    onCheckedChange={mirror => patchAppearance({ mirror })}
                  />
                </SettingRow>

                <SettingRow label="响应点击">
                  <Switch
                    checked={active.appearance.clickEnabled}
                    onCheckedChange={clickEnabled => patchAppearance({ clickEnabled })}
                  />
                </SettingRow>
              </>
            )
          : null}
      </SettingSection>
    </>
  )
}

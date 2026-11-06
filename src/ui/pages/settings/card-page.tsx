/**
 * 角色卡设置页。
 *
 * 对齐原项目：名称与人设按角色共享，聊天模型与历史轮数按实例隔离。
 * 改动不动资源文件。
 */

import { useEffect, useState } from 'react'

import { loadCharactersCatalog } from '@/character/catalog'
import type { CharacterDefinition } from '@/character/types'
import { useCardStore } from '@/config/domains/card'
import { useCharacterStore } from '@/config/domains/character'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'

export function CardPage() {
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const setActiveInstance = useCharacterStore(state => state.setActiveInstance)
  const addInstance = useCharacterStore(state => state.addInstance)
  const profiles = useCardStore(state => state.profiles)
  const chats = useCardStore(state => state.chats)
  const updateProfile = useCardStore(state => state.updateProfile)
  const updateChat = useCardStore(state => state.updateChat)
  const resetChat = useCardStore(state => state.resetChat)
  const [characters, setCharacters] = useState<CharacterDefinition[]>([])

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

  const instance = instances.find(item => item.id === activeInstanceId) ?? instances[0]
  const instanceId = instance?.id ?? ''
  const characterId = instance?.characterId ?? ''
  const character = characters.find(item => item.id === characterId)
  const profile = profiles[characterId] ?? {}
  const chat = chats[instanceId] ?? {}
  const name = profile.name ?? character?.name ?? ''
  const persona = profile.persona ?? character?.persona ?? ''

  const instanceLabel = (characterIdOf: string, index: number): string => {
    return `${index + 1}. ${characters.find(candidate => candidate.id === characterIdOf)?.name ?? characterIdOf}`
  }

  /** 切换角色：已有实例就切换，没有就自动创建一个。 */
  const switchCharacter = (nextCharacterId: string) => {
    const existing = instances.find(item => item.characterId === nextCharacterId)
    if (existing) {
      setActiveInstance(existing.id)
      return
    }

    addInstance(nextCharacterId)
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="角色卡" description="名称与人设按角色共享，聊天设置按实例隔离。">
        <SettingRow label="角色" description="切换角色；没有实例时会自动创建一个">
          <Select value={characterId} onValueChange={switchCharacter}>
            <SelectTrigger><SelectValue placeholder="选择角色" /></SelectTrigger>
            <SelectContent>
              {characters.map(item => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="实例" description="同一角色可以有多个实例">
          <Select value={instanceId} onValueChange={setActiveInstance}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {instances.map((item, index) => (
                <SelectItem key={item.id} value={item.id}>
                  {instanceLabel(item.characterId, index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="名称" description="只影响聊天与界面显示">
          <Input
            value={name}
            onChange={event => updateProfile(characterId, { name: event.target.value })}
          />
        </SettingRow>

        <SettingRow label="聊天模型" description="留空沿用全局模型">
          <Input
            value={chat.model ?? ''}
            placeholder="例如 gpt-4o-mini"
            onChange={event => updateChat(instanceId, { model: event.target.value })}
          />
        </SettingRow>

        <SettingRow label="历史轮数" description="发送给模型的历史对话轮数，一轮为一问一答">
          <Input
            type="number"
            min={2}
            max={50}
            value={chat.historyWindow ?? 12}
            onChange={event => updateChat(instanceId, { historyWindow: Number(event.target.value) || 12 })}
          />
        </SettingRow>

        <Button variant="outline" onClick={() => resetChat(instanceId)}>恢复聊天默认</Button>
      </SettingSection>

      <SettingSection title="人设" description="覆盖资源索引里的角色人设，同一角色的实例共享。">
        <textarea
          className="min-h-48 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={persona}
          onChange={event => updateProfile(characterId, { persona: event.target.value })}
        />
      </SettingSection>
    </div>
  )
}

/**
 * 好感度显示与重置。
 *
 * 好感度由对话 Agent 的 update_affinity 工具写入。
 */

import { DEFAULT_AFFINITY, useAffinityStore } from '@/config/domains/affinity'
import { useCharacterStore } from '@/config/domains/character'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

export function AffinityCard() {
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const instance = instances.find(item => item.id === activeInstanceId) ?? instances[0]
  const characterId = instance?.characterId ?? ''
  const value = useAffinityStore(state => state.values[characterId] ?? DEFAULT_AFFINITY)
  const reset = useAffinityStore(state => state.reset)

  return (
    <SettingSection title="好感度" description="按角色保存，对话模型通过工具调用调整。">
      {instance
        ? (
            <>
              <SettingRow label="当前好感度" description={`角色 ${characterId}`}>
                <span className="text-sm font-semibold">{value} / 100</span>
              </SettingRow>
              <Button size="sm" variant="outline" onClick={() => reset(characterId)}>
                重置为 {DEFAULT_AFFINITY}
              </Button>
            </>
          )
        : <p className="text-sm text-muted-foreground">还没有角色实例。</p>}
    </SettingSection>
  )
}

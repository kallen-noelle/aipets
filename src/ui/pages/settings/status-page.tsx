/**
 * 状态设置页：展示按角色保存的好感度，并说明尚未接入的状态项。
 */

import { DEFAULT_AFFINITY, useAffinityStore } from '@/config/domains/affinity'
import { useCharacterStore } from '@/config/domains/character'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

export function StatusPage() {
  const instances = useCharacterStore(state => state.instances)
  const values = useAffinityStore(state => state.values)
  const reset = useAffinityStore(state => state.reset)
  // 好感度按角色保存，同一角色多个实例共用一份。
  const characterIds = [...new Set(instances.map(item => item.characterId))]

  return (
    <div className="max-w-2xl">
      <SettingSection title="好感度" description="对话模型通过 update_affinity 工具调整，对话框里的情绪判断会读取它。">
        {characterIds.length === 0
          ? <p className="text-sm text-muted-foreground">还没有角色实例。</p>
          : characterIds.map(characterId => (
              <SettingRow key={characterId} label={characterId} description="0–100，默认 50">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-semibold">{values[characterId] ?? DEFAULT_AFFINITY} / 100</span>
                  <Button size="sm" variant="outline" onClick={() => reset(characterId)}>
                    重置
                  </Button>
                </div>
              </SettingRow>
            ))}
      </SettingSection>

      <SettingSection title="精力与心情" description="尚未接入。">
        <p className="text-sm text-muted-foreground">
          目前没有可写入的精力与心情数值来源：需要先确定随对话、时间或动作变化的规则，
          再补一个状态 store 与更新入口。现在这两项不参与提示词与动作选择。
        </p>
      </SettingSection>
    </div>
  )
}

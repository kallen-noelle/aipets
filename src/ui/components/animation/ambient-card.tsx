/**
 * 环境编排状态：最近生成、阶段数、总时长与手动重新生成。
 */

import { useEffect, useState } from 'react'

import { parseAmbientProgram, totalHoldMs } from '@/character/ambient'
import { loadCharactersCatalog, getCharacter } from '@/character/catalog'
import { longActions } from '@/character/perform'
import { useAmbientStore } from '@/config/domains/ambient'
import { useCharacterStore } from '@/config/domains/character'
import { emitPetEvent } from '@/desktop/pet-events'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

export function AmbientCard() {
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const instance = instances.find(item => item.id === activeInstanceId) ?? instances[0]
  const characterId = instance?.characterId ?? ''
  const record = useAmbientStore(state => state.records[instance?.id ?? ''])
  const program = record ? parseAmbientProgram(record.program) : null
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    if (!characterId)
      return

    let disposed = false
    void loadCharactersCatalog()
      .then((catalog) => {
        if (!disposed)
          setSupported(longActions(getCharacter(catalog, characterId)).length > 0)
      })
      .catch(() => {
        if (!disposed)
          setSupported(false)
      })

    return () => {
      disposed = true
    }
  }, [characterId])

  return (
    <SettingSection
      title="环境编排"
      description="回复结束 30 秒后尝试更新（临时测试值）；时长只是提示词期望，实际由模型决定；失败保留上一份。"
    >
      {!instance
        ? <p className="text-sm text-muted-foreground">还没有角色实例。</p>
        : supported === false
          ? <p className="text-sm text-muted-foreground">当前角色没有长动作素材，环境编排不会启用。</p>
          : (
              <>
                <SettingRow label="动作数" description={`实例 ${instance.id}`}>
                  <span className="text-sm">{program?.clips.length ?? 0}</span>
                </SettingRow>
                <SettingRow label="长动作总时长" description="短片不计时">
                  <span className="text-sm">
                    {program ? `${(totalHoldMs(program.clips) / 3_600_000).toFixed(1)} 小时` : '暂无'}
                  </span>
                </SettingRow>

                {program
                  ? (
                      <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                        <div className="text-muted-foreground">当前编排</div>
                        {program.clips.map((clip, index) => (
                          <div key={index} className="break-all">
                            {index + 1}
                            .
                            {clip.name}
                            ｜
                            {clip.durationMs
                              ? `${(clip.durationMs / 3_600_000).toFixed(1)} 小时`
                              : '短片'}
                          </div>
                        ))}
                        {program.reason
                          ? <div className="text-muted-foreground">理由：{program.reason}</div>
                          : null}
                      </div>
                    )
                  : null}
                {record?.generatedAt
                  ? (
                      <p className="text-xs text-muted-foreground">
                        生成于 {new Date(record.generatedAt).toLocaleString()}
                      </p>
                    )
                  : null}
                {record?.error
                  ? <p className="text-xs text-destructive">最近失败：{record.error}</p>
                  : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => emitPetEvent({ kind: 'ambient-refresh', instanceId: instance.id })}
                >
                  立即重新生成
                </Button>
              </>
            )}
    </SettingSection>
  )
}

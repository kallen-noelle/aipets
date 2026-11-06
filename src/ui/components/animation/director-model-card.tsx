/**
 * 动画导演模型设置。
 */

import { useAnimationStore } from '@/config/domains/animation'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'

export function DirectorModelCard() {
  const directorModel = useAnimationStore(state => state.directorModel)
  const lastClips = useAnimationStore(state => state.lastClips)
  const lastReason = useAnimationStore(state => state.lastReason)
  const lastError = useAnimationStore(state => state.lastError)
  const update = useAnimationStore(state => state.update)

  return (
    <SettingSection
      title="动画导演"
      description="导演模型留空时跟随当前对话模型；两者都为空时使用规则导演。"
    >
      <SettingRow label="导演模型" description="留空时跟随对话模型，也可以单独指定">
        <Input
          value={directorModel}
          placeholder="例如 gpt-4o-mini"
          onChange={event => update({ directorModel: event.target.value })}
        />
      </SettingRow>

      {lastClips.length > 0
        ? (
            <p className="text-xs text-muted-foreground">
              最近计划：{lastClips.join(' → ')}
              {lastReason ? `（${lastReason}）` : ''}
            </p>
          )
        : null}

      {lastError ? <p className="text-xs text-destructive">最近导演失败：{lastError}</p> : null}
    </SettingSection>
  )
}

/**
 * 触觉设置页：点击与拖拽是角色舞台的手势识别，按实例控制点击反应。
 *
 * 这里只改已有外观字段，不重复实现交互逻辑。
 */

import { useCharacterStore } from '@/config/domains/character'
import { SettingSection } from '@/ui/components/setting-section'
import { Switch } from '@/ui/components/ui/switch'

export function TouchPage() {
  const instances = useCharacterStore(state => state.instances)
  const updateInstance = useCharacterStore(state => state.updateInstance)

  return (
    <div className="max-w-2xl">
      <SettingSection
        title="触觉"
        description="点击与拖拽由舞台的手势识别处理：轻点触发被摸动作，拖动改变位置。"
      >
        {instances.map((instance, index) => (
          <div key={instance.id} className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                实例
                {' '}
                {index + 1}
                {' · '}
                {instance.characterId}
              </div>
              <div className="text-xs text-muted-foreground">关闭后点击角色不再触发被摸动作，拖拽仍然可用。</div>
            </div>
            <div className="flex w-56 shrink-0 justify-end">
              <Switch
                checked={instance.appearance.clickEnabled}
                onCheckedChange={checked => updateInstance(instance.id, {
                  appearance: { ...instance.appearance, clickEnabled: checked },
                })}
              />
            </div>
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          触觉没有独立模型或接口，不需要密钥；拖动范围与命中检测由角色资源自动计算。
        </p>
      </SettingSection>
    </div>
  )
}

/**
 * 对话参数设置页。
 *
 * 只读写 chat 域，提供商的配置不在这里。
 */

import { useChatConfigStore } from '@/config/domains/chat'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'
import { Slider } from '@/ui/components/ui/slider'
import { Switch } from '@/ui/components/ui/switch'

export function ConsciousnessPage() {
  const config = useChatConfigStore()
  const update = useChatConfigStore(state => state.update)

  return (
    <div className="max-w-2xl">
      <SettingSection title="采样参数" description="模型支持该参数时才开启。">
        <SettingRow label="启用温度">
          <Switch
            checked={config.temperatureEnabled}
            onCheckedChange={temperatureEnabled => update({ temperatureEnabled })}
          />
        </SettingRow>

        {config.temperatureEnabled
          ? (
              <SettingRow label="温度" description={`当前 ${config.temperature.toFixed(2)}`}>
                <Slider
                  min={0}
                  max={2}
                  step={0.05}
                  value={[config.temperature]}
                  onValueChange={([value]) => update({ temperature: value })}
                />
              </SettingRow>
            )
          : null}

        <SettingRow label="启用 Top P">
          <Switch
            checked={config.topPEnabled}
            onCheckedChange={topPEnabled => update({ topPEnabled })}
          />
        </SettingRow>

        {config.topPEnabled
          ? (
              <SettingRow label="Top P" description={`当前 ${config.topP.toFixed(2)}`}>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[config.topP]}
                  onValueChange={([value]) => update({ topP: value })}
                />
              </SettingRow>
            )
          : null}
      </SettingSection>

      <SettingSection title="上下文" description="控制历史消息占用的上下文长度。">
        <SettingRow label="最大步数" description="单轮对话最多的模型调用次数">
          <Input
            type="number"
            min={1}
            max={30}
            value={config.maxSteps}
            onChange={event => update({ maxSteps: Number(event.target.value) || 1 })}
          />
        </SettingRow>

        <SettingRow label="摘要阈值" description="消息超过该条数时压缩历史">
          <Input
            type="number"
            min={4}
            max={200}
            value={config.summaryThreshold}
            onChange={event => update({ summaryThreshold: Number(event.target.value) || 4 })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

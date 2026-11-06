/**
 * 节拍同步设置页。
 */

import { useBeatSyncStore } from '@/config/domains/beat-sync'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'
import { Slider } from '@/ui/components/ui/slider'
import { Switch } from '@/ui/components/ui/switch'

export function BeatSyncPage() {
  const config = useBeatSyncStore()
  const update = useBeatSyncStore(state => state.update)

  return (
    <div className="max-w-2xl">
      <SettingSection title="节拍同步" description="麦克风检测节拍，驱动角色动作。">
        <SettingRow label="灵敏度" description={config.sensitivity.toFixed(2)}>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[config.sensitivity]}
            onValueChange={([sensitivity]) => update({ sensitivity })}
          />
        </SettingRow>

        <SettingRow label="最短节拍间隔" description={`${config.minBeatIntervalMs} 毫秒`}>
          <Slider
            min={60}
            max={2000}
            step={10}
            value={[config.minBeatIntervalMs]}
            onValueChange={([minBeatIntervalMs]) => update({ minBeatIntervalMs })}
          />
        </SettingRow>

        <SettingRow label="缓冲区" description={`${config.bufferDurationMs} 毫秒`}>
          <Slider
            min={200}
            max={4000}
            step={50}
            value={[config.bufferDurationMs]}
            onValueChange={([bufferDurationMs]) => update({ bufferDurationMs })}
          />
        </SettingRow>

        <SettingRow label="低频滤波" description={`${config.lowpassHz} Hz`}>
          <Slider
            min={20}
            max={400}
            step={10}
            value={[config.lowpassHz]}
            onValueChange={([lowpassHz]) => update({ lowpassHz })}
          />
        </SettingRow>

        <SettingRow label="高频滤波" description={`${config.highpassHz} Hz`}>
          <Slider
            min={80}
            max={2000}
            step={10}
            value={[config.highpassHz]}
            onValueChange={([highpassHz]) => update({ highpassHz })}
          />
        </SettingRow>

        <SettingRow label="包络时长" description={`${config.envelopeMs} 毫秒`}>
          <Slider
            min={20}
            max={1000}
            step={10}
            value={[config.envelopeMs]}
            onValueChange={([envelopeMs]) => update({ envelopeMs })}
          />
        </SettingRow>

        <SettingRow label="自适应阈值">
          <Switch
            checked={config.adaptiveThreshold}
            onCheckedChange={adaptiveThreshold => update({ adaptiveThreshold })}
          />
        </SettingRow>

        <SettingRow label="频谱通量">
          <Switch
            checked={config.spectralFlux}
            onCheckedChange={spectralFlux => update({ spectralFlux })}
          />
        </SettingRow>

        <SettingRow label="预热时长" description={`${config.warmupMs} 毫秒`}>
          <Slider
            min={0}
            max={5000}
            step={100}
            value={[config.warmupMs]}
            onValueChange={([warmupMs]) => update({ warmupMs })}
          />
        </SettingRow>

        <SettingRow label="频谱刻度">
          <Select
            value={config.spectrumScale}
            onValueChange={spectrumScale => update({ spectrumScale: spectrumScale as typeof config.spectrumScale })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">线性</SelectItem>
              <SelectItem value="log">对数</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

/**
 * 语音监测：按桌面采集参数打开麦克风，显示音量与说话状态。
 *
 * 采集约束来自桌面偏好，设备来自语音域的录音设备。
 */

import { useEffect, useRef, useState } from 'react'

import { MicrophoneMonitor, type VoiceActivityState } from '@/audio/microphone'
import { useDesktopPreferencesStore } from '@/config/domains/desktop'
import { useSpeechStore } from '@/config/domains/speech'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Switch } from '@/ui/components/ui/switch'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

export function VoiceMonitorCard() {
  const prefs = useDesktopPreferencesStore()
  const updatePrefs = useDesktopPreferencesStore(state => state.update)
  const inputDeviceId = useSpeechStore(state => state.inputDeviceId)
  const [monitoring, setMonitoring] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState<VoiceActivityState | null>(null)
  const monitorRef = useRef<MicrophoneMonitor | null>(null)

  const stop = () => {
    monitorRef.current?.stop()
    monitorRef.current = null
    setMonitoring(false)
    setActivity(null)
  }

  // 离开页面时不能继续占用麦克风。
  useEffect(() => stop, [])

  const start = async () => {
    setError(null)
    setBusy(true)
    try {
      const monitor = new MicrophoneMonitor()
      monitor.subscribe(setActivity)
      await monitor.start({
        deviceId: inputDeviceId || undefined,
        echoCancellation: prefs.echoCancellation,
        noiseSuppression: prefs.noiseSuppression,
        autoGainControl: prefs.autoGainControl,
      })
      monitorRef.current = monitor
      setMonitoring(true)
    }
    catch (cause) {
      monitorRef.current?.stop()
      monitorRef.current = null
      setError(errorText(cause))
    }
    finally {
      setBusy(false)
    }
  }

  const level = activity ? Math.round(activity.level * 100) : 0

  return (
    <SettingSection
      title="语音监测"
      description="回声消除让角色听不到自己的声音，监测显示当前的说话状态。"
    >
      <SettingRow label="回声消除" description="从麦克风输入里去掉扬声器输出">
        <Switch
          checked={prefs.echoCancellation}
          onCheckedChange={echoCancellation => updatePrefs({ echoCancellation })}
        />
      </SettingRow>

      <SettingRow label="降噪">
        <Switch
          checked={prefs.noiseSuppression}
          onCheckedChange={noiseSuppression => updatePrefs({ noiseSuppression })}
        />
      </SettingRow>

      <SettingRow label="自动增益">
        <Switch
          checked={prefs.autoGainControl}
          onCheckedChange={autoGainControl => updatePrefs({ autoGainControl })}
        />
      </SettingRow>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || monitoring} onClick={() => void start()}>
          开始监测
        </Button>
        <Button variant="outline" size="sm" disabled={!monitoring} onClick={stop}>
          停止监测
        </Button>
      </div>

      {monitoring
        ? (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-sky-400 transition-[width] duration-100"
                  style={{ width: `${level}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {activity?.speaking ? '检测到说话' : '安静'}
              </p>
            </div>
          )
        : null}

      {error ? <p className="text-xs text-destructive">麦克风打开失败：{error}</p> : null}
    </SettingSection>
  )
}

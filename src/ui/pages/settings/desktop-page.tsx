/**
 * 桌面设置页：运行环境、窗口、电池、屏幕捕获与语音监测。
 *
 * 具体能力在对应组件里，页面只做编排。
 */

import { Link } from 'react-router'

import { useSpeechStore } from '@/config/domains/speech'
import { getDesktopBridge } from '@/desktop/bridge'
import { BatteryCard } from '@/ui/components/desktop/battery-card'
import { ScreenCaptureCard } from '@/ui/components/desktop/screen-capture-card'
import { VoiceMonitorCard } from '@/ui/components/desktop/voice-monitor-card'
import { WindowsCard } from '@/ui/components/desktop/windows-card'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'

export function DesktopPage() {
  const inputDeviceId = useSpeechStore(state => state.inputDeviceId)
  const outputDeviceId = useSpeechStore(state => state.outputDeviceId)
  const bridge = getDesktopBridge()

  return (
    <div className="max-w-2xl">
      <SettingSection
        title="运行环境"
        description={bridge ? '桌面外壳' : '浏览器，窗口与托盘能力不可用'}
      >
        <SettingRow label="平台" description={bridge?.platform ?? navigator.platform}>
          <span />
        </SettingRow>
        <SettingRow
          label="音频设备"
          description={`录音 ${inputDeviceId || '默认'} / 播放 ${outputDeviceId || '默认'}`}
        >
          <Link className="text-sm text-primary" to="/settings/modules/speech">在语音页选择</Link>
        </SettingRow>
      </SettingSection>

      <WindowsCard />
      <BatteryCard />
      <ScreenCaptureCard />
      <VoiceMonitorCard />
    </div>
  )
}

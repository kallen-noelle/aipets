/**
 * 语音设置页。
 *
 * 朗读可在接口与系统语音之间切换，识别可在本地与接口之间切换。
 */

import { useEffect, useState } from 'react'

import { speechProvider, useProvidersStore } from '@/config/domains/providers'
import { useSpeechStore } from '@/config/domains/speech'
import { listAudioDevices, type AudioDevices } from '@/speech/devices'
import { isLocalSpeechAvailable, listLocalVoices, speak } from '@/speech/tts'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Slider } from '@/ui/components/ui/slider'
import { Switch } from '@/ui/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'

export function SpeechPage() {
  const config = useSpeechStore()
  const update = useSpeechStore(state => state.update)
  const providers = useProvidersStore(state => state.items)
  const speechId = useProvidersStore(state => state.speechId)
  const setSpeech = useProvidersStore(state => state.setSpeech)
  const [devices, setDevices] = useState<AudioDevices>({ inputs: [], outputs: [], labeled: false })
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [testResult, setTestResult] = useState<string | null>(null)

  const localSpeech = isLocalSpeechAvailable()
  const speechProviders = providers.filter(item => item.capabilities.includes('speech'))
  const activeSpeech = speechProvider()

  const refreshDevices = () => {
    void listAudioDevices().then(setDevices)
  }

  useEffect(() => {
    refreshDevices()

    if (!localSpeech)
      return

    const refreshVoices = () => setVoices(listLocalVoices())
    refreshVoices()
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
    }
  }, [localSpeech])

  const inputLabel = devices.inputs.find(item => item.deviceId === config.inputDeviceId)
  const outputLabel = devices.outputs.find(item => item.deviceId === config.outputDeviceId)

  const testVoice = async () => {
    setTestResult(null)
    try {
      const stop = await speak('你好，我是你的桌面伙伴。')
      window.setTimeout(stop, 4000)
      setTestResult('已开始播放')
    }
    catch {
      setTestResult('播放失败，请检查提供商或系统语音')
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="朗读" description="回复完成后可以让角色把内容读出来。">
        <SettingRow label="启用语音">
          <Switch
            checked={config.ttsEnabled}
            onCheckedChange={ttsEnabled => update({ ttsEnabled })}
          />
        </SettingRow>

        <SettingRow label="自动朗读" description="关闭后需要手动触发">
          <Switch
            checked={config.autoSpeak}
            onCheckedChange={autoSpeak => update({ autoSpeak })}
          />
        </SettingRow>

        <SettingRow label="朗读方式" description={localSpeech ? '系统语音不需要 Key' : '当前环境没有系统语音'}>
          <Select
            value={config.engine}
            onValueChange={engine => update({ engine: engine as 'provider' | 'local' })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="provider">接口合成</SelectItem>
              <SelectItem value="local" disabled={!localSpeech}>系统语音</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {config.engine === 'provider'
          ? (
              <>
                <SettingRow
                  label="提供商"
                  description={speechId ? '已单独指定' : `跟随对话：${activeSpeech?.label ?? '未配置'}`}
                >
                  <Select
                    value={speechId || 'active'}
                    onValueChange={value => setSpeech(value === 'active' ? '' : value)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">跟随对话提供商</SelectItem>
                      {speechProviders.map(provider => (
                        <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label="音色" description="接口支持的音色名，例如 alloy">
                  <Input value={config.voice} onChange={event => update({ voice: event.target.value })} />
                </SettingRow>

                <SettingRow label="语音模型" description="例如 tts-1">
                  <Input value={config.model} onChange={event => update({ model: event.target.value })} />
                </SettingRow>
              </>
            )
          : (
              <>
                <SettingRow label="系统音色" description="留空则自动选择中文音色">
                  <Select
                    value={config.localVoice || 'auto'}
                    onValueChange={localVoice => update({ localVoice: localVoice === 'auto' ? '' : localVoice })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动</SelectItem>
                      {voices.map(voice => (
                        <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}（{voice.lang}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label="语速" description={config.localRate.toFixed(2)}>
                  <Slider
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={[config.localRate]}
                    onValueChange={([value]) => update({ localRate: value })}
                  />
                </SettingRow>

                <SettingRow label="音调" description={config.localPitch.toFixed(2)}>
                  <Slider
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={[config.localPitch]}
                    onValueChange={([value]) => update({ localPitch: value })}
                  />
                </SettingRow>
              </>
            )}

        <Button variant="outline" onClick={() => void testVoice()}>试听</Button>
        {testResult ? <p className="text-xs text-muted-foreground">{testResult}</p> : null}
      </SettingSection>

      <SettingSection
        title="音频设备"
        description="设备名不可见时，先允许录音权限再刷新。"
      >
        <SettingRow label="录音设备">
          <Select
            value={config.inputDeviceId || 'default'}
            onValueChange={inputDeviceId => update({ inputDeviceId: inputDeviceId === 'default' ? '' : inputDeviceId })}
          >
            <SelectTrigger>
              <SelectValue placeholder={inputLabel?.label ?? '默认设备'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认设备</SelectItem>
              {devices.inputs.map(device => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || '未命名设备'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="播放设备">
          <Select
            value={config.outputDeviceId || 'default'}
            onValueChange={outputDeviceId => update({ outputDeviceId: outputDeviceId === 'default' ? '' : outputDeviceId })}
          >
            <SelectTrigger>
              <SelectValue placeholder={outputLabel?.label ?? '默认设备'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认设备</SelectItem>
              {devices.outputs.map(device => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || '未命名设备'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <Button variant="outline" onClick={refreshDevices}>刷新设备</Button>
      </SettingSection>
    </div>
  )
}

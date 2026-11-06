/**
 * 语音识别设置页：识别方式、语言与子页入口。
 */

import { Link } from 'react-router'

import { useHearingStore } from '@/config/domains/hearing'
import { isLocalRecognitionAvailable } from '@/speech/local-recognition'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Input } from '@/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'

export function HearingPage() {
  const config = useHearingStore()
  const update = useHearingStore(state => state.update)
  const local = isLocalRecognitionAvailable()

  return (
    <div className="max-w-2xl">
      <SettingSection
        title="语音识别"
        description={local ? '当前环境支持本地识别。' : '当前环境不支持本地识别，自动模式会走接口。'}
      >
        <SettingRow label="识别方式">
          <Select
            value={config.mode}
            onValueChange={mode => update({ mode: mode as typeof config.mode })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动</SelectItem>
              <SelectItem value="local" disabled={!local}>本地识别</SelectItem>
              <SelectItem value="provider">接口转写</SelectItem>
              <SelectItem value="omni">对话模型转写</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="识别语言" description="BCP 47 语言标签">
          <Input value={config.language} onChange={event => update({ language: event.target.value })} />
        </SettingRow>

        {config.mode === 'omni'
          ? (
              <p className="text-xs text-muted-foreground">
                对话模型转写使用转写页配置的模型，例如 qwen3.8-omni-flash。
              </p>
            )
          : null}
      </SettingSection>

      <SettingSection title="子页" description="转写模型、唤醒词与声纹单独配置。">
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border px-3 py-1.5 text-sm" to="/settings/modules/hearing/transcriber">
            转写与改写
          </Link>
          <Link className="rounded-md border px-3 py-1.5 text-sm" to="/settings/modules/hearing/wake-words">
            唤醒词
          </Link>
          <Link className="rounded-md border px-3 py-1.5 text-sm" to="/settings/modules/hearing/voiceprint">
            声纹
          </Link>
        </div>
      </SettingSection>
    </div>
  )
}

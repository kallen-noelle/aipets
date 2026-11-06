/**
 * 图像设置页：开关、模型、尺寸，并提供一次试画。
 */

import { useState } from 'react'

import { useImageStore } from '@/config/domains/image'
import { generateImage } from '@/image/generate'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Switch } from '@/ui/components/ui/switch'

export function ImagePage() {
  const config = useImageStore()
  const update = useImageStore(state => state.update)

  const [prompt, setPrompt] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const test = async () => {
    if (!prompt.trim())
      return

    setBusy(true)
    setMessage(null)
    try {
      setPreview(await generateImage(prompt.trim()))
    }
    catch {
      setMessage('生成失败，请检查提供商是否支持图像接口')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="图像生成" description="使用提供商的图像接口，按次计费。">
        <SettingRow label="启用">
          <Switch checked={config.enabled} onCheckedChange={enabled => update({ enabled })} />
        </SettingRow>

        <SettingRow label="模型">
          <Input value={config.model} onChange={event => update({ model: event.target.value })} />
        </SettingRow>

        <SettingRow label="尺寸">
          <Input value={config.size} onChange={event => update({ size: event.target.value })} />
        </SettingRow>
      </SettingSection>

      <SettingSection title="试画" description="输入描述，验证接口是否可用。">
        <Input
          value={prompt}
          placeholder="例如：一只蓝发小女仆"
          onChange={event => setPrompt(event.target.value)}
        />
        <Button onClick={test} disabled={busy || !prompt.trim()}>
          {busy ? '生成中…' : '生成'}
        </Button>

        {message
          ? <p className="text-xs text-destructive">{message}</p>
          : null}

        {preview
          ? <img src={preview} alt="生成结果" className="max-w-xs rounded border" />
          : null}
      </SettingSection>
    </div>
  )
}

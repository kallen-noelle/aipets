/**
 * 贴纸设置页：回复贴纸开关、概率、地址与本地图片。
 */

import { useRef, useState } from 'react'

import {
  MAX_STICKERS,
  stickerSource,
  useStickersStore,
  type Sticker,
} from '@/config/domains/stickers'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Slider } from '@/ui/components/ui/slider'
import { Switch } from '@/ui/components/ui/switch'

/** 单张图片上限，超过时不读入，避免撑爆 localStorage。 */
const MAX_BYTES = 1.5 * 1024 * 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(new Error('读取图片失败')))
    reader.readAsDataURL(file)
  })
}

export function StickersPage() {
  const items = useStickersStore(state => state.items)
  const enabled = useStickersStore(state => state.enabled)
  const frequency = useStickersStore(state => state.frequency)
  const add = useStickersStore(state => state.add)
  const remove = useStickersStore(state => state.remove)
  const updateSettings = useStickersStore(state => state.updateSettings)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addUrl = () => {
    if (!name.trim() || !url.trim())
      return

    if (add({ name: name.trim(), url: url.trim() })) {
      setName('')
      setUrl('')
      setMessage(null)
    }
    else {
      setMessage(`贴纸库最多 ${MAX_STICKERS} 张`)
    }
  }

  /** 批量读取本地图片，任一超限或库满时停止并提示。 */
  const upload = async (files: File[]) => {
    const total = items.length + files.length
    if (total > MAX_STICKERS) {
      setMessage(`贴纸库最多 ${MAX_STICKERS} 张，当前还能添加 ${MAX_STICKERS - items.length} 张`)
      return
    }

    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setMessage(`「${file.name}」超过 1.5 MB，已跳过`)
        continue
      }

      const dataUrl = await readAsDataUrl(file)
      add({ name: file.name, url: '', dataUrl })
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="回复贴纸" description="回复时按概率附带一张贴纸。">
        <SettingRow label="启用贴纸">
          <Switch checked={enabled} onCheckedChange={value => updateSettings({ enabled: value })} />
        </SettingRow>

        <SettingRow label="附带概率" description={`${(frequency * 100).toFixed(0)}%`}>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[frequency]}
            onValueChange={([value]) => updateSettings({ frequency: value })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection
        title="新增贴纸"
        description={`填写图片地址，或一次选择多张本地图片。每张不超过 1.5 MB，最多 ${MAX_STICKERS} 张。`}
      >
        <div className="flex items-center gap-2">
          <Input value={name} placeholder="名称" onChange={event => setName(event.target.value)} />
          <Input value={url} placeholder="https://..." onChange={event => setUrl(event.target.value)} />
          <Button onClick={addUrl}>添加</Button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              if (files.length > 0)
                void upload(files)
              event.target.value = ''
            }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            上传本地图片
          </Button>
          <span className="text-xs text-muted-foreground">已用 {items.length} / {MAX_STICKERS}</span>
        </div>

        {message ? <p className="text-xs text-destructive">{message}</p> : null}
      </SettingSection>

      <SettingSection title={`已有贴纸（${items.length}）`}>
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">还没有贴纸。</p>
          : (
              <div className="flex flex-wrap gap-3">
                {items.map((item: Sticker) => (
                  <div key={item.id} className="w-24 space-y-1">
                    <img
                      src={stickerSource(item)}
                      alt={item.name}
                      className="h-20 w-24 rounded object-cover"
                    />
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs">{item.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => remove(item.id)}>删</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </SettingSection>
    </div>
  )
}

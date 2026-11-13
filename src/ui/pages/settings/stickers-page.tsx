/**
 * 表情包设置页：启用开关、频率档位、可用表情的导入与编辑。
 *
 * 表情包只对内置主角 main 生效，这里维护的是主角使用的那一份图库。
 */

import { useRef, useState } from 'react'

import {
  MAX_STICKERS,
  STICKER_FREQUENCIES,
  STICKER_TAGS,
  stickerSource,
  useStickersStore,
  type Sticker,
  type StickerTag,
} from '@/config/domains/stickers'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/ui/select'
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
  const update = useStickersStore(state => state.update)
  const remove = useStickersStore(state => state.remove)
  const updateSettings = useStickersStore(state => state.updateSettings)

  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftTags, setDraftTags] = useState<StickerTag[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  /** 批量读取本地图片，任一超限或库满时跳过并提示。 */
  const upload = async (files: File[]) => {
    if (items.length + files.length > MAX_STICKERS) {
      setMessage(`表情库最多 ${MAX_STICKERS} 张，当前还能添加 ${MAX_STICKERS - items.length} 张`)
      return
    }

    setMessage(null)
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        setMessage(`「${file.name}」超过 1.5 MB，已跳过`)
        continue
      }

      const dataUrl = await readAsDataUrl(file)
      add({ name: file.name, url: '', dataUrl })
    }
  }

  const startEdit = (sticker: Sticker) => {
    setEditingId(sticker.id)
    setDraftName(sticker.name)
    setDraftTags(sticker.tags)
    setMessage(null)
  }

  const toggleTag = (tag: StickerTag) => {
    setDraftTags(tags => tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag])
  }

  const saveEdit = () => {
    if (!editingId || !draftName.trim())
      return

    update(editingId, { name: draftName.trim(), tags: draftTags })
    setEditingId(null)
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">表情包</h1>
          <p className="mt-1 text-sm text-muted-foreground">角色会在合适的时机挑一张表情包一起回复。</p>
        </div>
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={items.length >= MAX_STICKERS}
        >
          导入图片
        </Button>
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
      </div>

      <div className="mt-4">
        <SettingSection title="表情包设置">
          <SettingRow label="启用表情包" description="目前只有主角拥有表情包。">
            <Switch checked={enabled} onCheckedChange={value => updateSettings({ enabled: value })} />
          </SettingRow>

          <SettingRow
            label="表情包频率"
            description="按此比例允许回复发送表情包。角色仍会判断表情是否适合当前对话"
          >
            <Select
              value={String(frequency)}
              onValueChange={value => updateSettings({ frequency: Number(value) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STICKER_FREQUENCIES.map(option => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <p className="text-xs text-muted-foreground">
            图片保留在当前设备。云端聊天同步目前仅传输文字。
          </p>
        </SettingSection>

        <SettingSection
          title={`可用表情（${items.length}/${MAX_STICKERS}）`}
          description="给表情打上情绪标签，角色会结合当前语境挑选。"
        >
          {message ? <p className="text-xs text-destructive">{message}</p> : null}

          {items.length === 0
            ? <p className="text-sm text-muted-foreground">还没有表情，点击右上角“导入图片”添加。</p>
            : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {items.map(item => (
                    <div key={item.id} className="rounded-xl border p-2">
                      <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                        <img
                          src={stickerSource(item)}
                          alt={item.name}
                          className="max-h-24 max-w-full object-contain"
                        />
                      </div>

                      {editingId === item.id
                        ? (
                            <div className="mt-2 space-y-2">
                              <Input
                                value={draftName}
                                placeholder="表情名称"
                                onChange={event => setDraftName(event.target.value)}
                              />
                              <div className="flex flex-wrap gap-1">
                                {STICKER_TAGS.map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                                      draftTags.includes(tag)
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-accent'
                                    }`}
                                    onClick={() => toggleTag(tag)}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>取消</Button>
                                <Button size="sm" onClick={saveEdit}>保存</Button>
                              </div>
                            </div>
                          )
                        : (
                            <>
                              <div className="mt-2 truncate text-xs font-medium">{item.name}</div>
                              <div className="mt-1 flex min-h-4 flex-wrap gap-1">
                                {item.tags.length > 0
                                  ? item.tags.map(tag => (
                                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {tag}
                                      </span>
                                    ))
                                  : <span className="text-[10px] text-muted-foreground">未设标签</span>}
                              </div>
                              <div className="mt-2 flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>编辑</Button>
                                <Button size="sm" variant="ghost" onClick={() => remove(item.id)}>删除</Button>
                              </div>
                            </>
                          )}
                    </div>
                  ))}
                </div>
              )}
        </SettingSection>
      </div>
    </div>
  )
}

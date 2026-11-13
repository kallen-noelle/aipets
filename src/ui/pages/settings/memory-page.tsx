/**
 * 记忆设置页。
 *
 * 记忆条目由对话后的自动提取、模型工具或这里手动写入；手动条目不会被自动
 * 提取覆盖。列表展示每条记忆的归属与来源。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { useCharacterStore } from '@/config/domains/character'
import { memoryEntrySchema, useMemoryStore, type MemoryEntry } from '@/config/domains/memory'
import { SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'
import { Textarea } from '@/ui/components/ui/textarea'

const formSchema = memoryEntrySchema.pick({ name: true, description: true, content: true })
type FormValues = z.infer<typeof formSchema>

const EMPTY: FormValues = { name: '', description: '', content: '' }
/** 归属下拉里代表“全部实例”的值，实例 id 不会与之冲突。 */
const SHARED_SCOPE = 'all'

export function MemoryPage() {
  const entries = useMemoryStore(state => state.entries)
  const remember = useMemoryStore(state => state.remember)
  const update = useMemoryStore(state => state.update)
  const remove = useMemoryStore(state => state.remove)
  const instances = useCharacterStore(state => state.instances)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [scope, setScope] = useState<string>(SHARED_SCOPE)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  })

  const selectedInstance = instances.find(item => item.id === scope)

  const scopeLabel = (entry: MemoryEntry): string => {
    if (!entry.instanceId)
      return '全部实例'
    const index = instances.findIndex(item => item.id === entry.instanceId)
    return index >= 0 ? `实例 ${index + 1} · ${instances[index].characterId}` : '所属实例已删除'
  }

  const onSubmit = form.handleSubmit((values) => {
    if (editingId) {
      update(editingId, {
        ...values,
        instanceId: selectedInstance?.id,
        characterId: selectedInstance?.characterId,
      })
    }
    else {
      remember(values, selectedInstance
        ? { instanceId: selectedInstance.id, characterId: selectedInstance.characterId }
        : {})
    }

    setEditingId(null)
    setScope(SHARED_SCOPE)
    form.reset(EMPTY)
  })

  const startEdit = (id: string) => {
    const entry = entries.find(item => item.id === id)
    if (!entry)
      return

    setEditingId(id)
    // 实例已被删除时退回“全部实例”，保存后归属随之更新。
    setScope(entry.instanceId && instances.some(item => item.id === entry.instanceId)
      ? entry.instanceId
      : SHARED_SCOPE)
    form.reset({ name: entry.name, description: entry.description, content: entry.content })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setScope(SHARED_SCOPE)
    form.reset(EMPTY)
  }

  return (
    <div className="max-w-2xl">
      <SettingSection
        title={editingId ? '编辑记忆' : '新增记忆'}
        description="记忆会在模型调用前按预算注入，手动条目不会被自动提取覆盖。"
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">名称</Label>
          <Input id="name" placeholder="例如：主人的口味" {...form.register('name')} />
          {form.formState.errors.name
            ? <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">一句话说明</Label>
          <Input id="description" placeholder="例如：喜欢喝冰美式" {...form.register('description')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="content">正文</Label>
          <Textarea id="content" rows={4} placeholder="完整描述" {...form.register('content')} />
          {form.formState.errors.content
            ? <p className="text-xs text-destructive">{form.formState.errors.content.message}</p>
            : null}
        </div>

        <div className="space-y-1.5">
          <Label>归属</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger aria-label="记忆归属">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SHARED_SCOPE}>全部实例</SelectItem>
              {instances.map((instance, index) => (
                <SelectItem key={instance.id} value={instance.id}>
                  {`仅实例 ${index + 1} · ${instance.characterId}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={onSubmit}>{editingId ? '保存修改' : '添加'}</Button>
          {editingId ? <Button variant="ghost" onClick={cancelEdit}>取消</Button> : null}
        </div>
      </SettingSection>

      <SettingSection title={`已有记忆（${entries.length}）`}>
        {entries.length === 0
          ? <p className="text-sm text-muted-foreground">还没有记忆条目。</p>
          : entries.map(entry => (
              <div key={entry.id} className="flex items-start justify-between gap-4 border-b py-2 last:border-b-0">
                <div className="space-y-1">
                  <div className="text-sm font-medium">{entry.name}</div>
                  <div className="text-xs text-muted-foreground">{entry.description || entry.content}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {`${scopeLabel(entry)} · ${entry.source === 'manual' ? '手动' : '自动'} · ${new Date(entry.updatedAt).toLocaleDateString('zh-CN')}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(entry.id)}>编辑</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(entry.id)}>删除</Button>
                </div>
              </div>
            ))}
      </SettingSection>
    </div>
  )
}

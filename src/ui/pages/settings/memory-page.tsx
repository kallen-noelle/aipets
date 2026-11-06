/**
 * 记忆设置页。
 *
 * 记忆条目在对话后自动提取，这里提供手动增删改。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { memoryEntrySchema, useMemoryStore } from '@/config/domains/memory'
import { SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { Textarea } from '@/ui/components/ui/textarea'

const formSchema = memoryEntrySchema.omit({ id: true, createdAt: true })
type FormValues = z.infer<typeof formSchema>

const EMPTY: FormValues = { name: '', description: '', content: '' }

export function MemoryPage() {
  const entries = useMemoryStore(state => state.entries)
  const add = useMemoryStore(state => state.add)
  const update = useMemoryStore(state => state.update)
  const remove = useMemoryStore(state => state.remove)

  const [editingId, setEditingId] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  })

  const onSubmit = form.handleSubmit((values) => {
    if (editingId)
      update(editingId, values)
    else
      add(values)

    setEditingId(null)
    form.reset(EMPTY)
  })

  const startEdit = (id: string) => {
    const entry = entries.find(item => item.id === id)
    if (!entry)
      return

    setEditingId(id)
    form.reset({ name: entry.name, description: entry.description, content: entry.content })
  }

  return (
    <div className="max-w-2xl">
      <SettingSection
        title={editingId ? '编辑记忆' : '新增记忆'}
        description="记忆会注入系统提示词，让角色记住这些设定。"
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

        <div className="flex items-center gap-2">
          <Button onClick={onSubmit}>{editingId ? '保存修改' : '添加'}</Button>
          {editingId
            ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null)
                    form.reset(EMPTY)
                  }}
                >
                  取消
                </Button>
              )
            : null}
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

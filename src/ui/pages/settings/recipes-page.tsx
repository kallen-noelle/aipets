/**
 * 配方设置页：可复用的提示词模板。
 *
 * 角色提议的配方需要先批准，批准后才能启用。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { recipeSchema, useRecipesStore, type Recipe } from '@/config/domains/recipes'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'
import { Textarea } from '@/ui/components/ui/textarea'

const EMPTY = { name: '', description: '', prompt: '' }

export function RecipesPage() {
  const items = useRecipesStore(state => state.items)
  const add = useRecipesStore(state => state.add)
  const remove = useRecipesStore(state => state.remove)
  const setEnabled = useRecipesStore(state => state.setEnabled)
  const approve = useRecipesStore(state => state.approve)
  const proposalsEnabled = useRecipesStore(state => state.proposalsEnabled)
  const setProposalsEnabled = useRecipesStore(state => state.setProposalsEnabled)

  const form = useForm({ resolver: zodResolver(recipeSchema), defaultValues: EMPTY })
  const [keywords, setKeywords] = useState('')
  const [background, setBackground] = useState(false)

  const onSubmit = form.handleSubmit((values) => {
    add({
      ...values,
      keywords: keywords.split(',').map(word => word.trim()).filter(Boolean),
      background,
    })
    form.reset(EMPTY)
    setKeywords('')
    setBackground(false)
  })

  return (
    <div className="max-w-2xl">
      <SettingSection title="配方提议" description="允许角色在对话里提议新配方。">
        <SettingRow label="允许提议">
          <Switch checked={proposalsEnabled} onCheckedChange={setProposalsEnabled} />
        </SettingRow>
      </SettingSection>

      <SettingSection title="新增配方" description="启用的配方都会附加到系统提示词。">
        <div className="space-y-1.5">
          <Label htmlFor="recipe-name">名称</Label>
          <Input id="recipe-name" placeholder="例如：傲娇模式" {...form.register('name')} />
          {form.formState.errors.name
            ? <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recipe-description">何时使用</Label>
          <Input
            id="recipe-description"
            placeholder="例如：主人生气时"
            {...form.register('description')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recipe-keywords">代码词</Label>
          <Input
            id="recipe-keywords"
            value={keywords}
            placeholder="逗号分隔，例如 傲娇, 撒娇"
            onChange={event => setKeywords(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="recipe-prompt">做什么</Label>
          <Textarea id="recipe-prompt" rows={4} placeholder="例如：说话要带一点傲娇" {...form.register('prompt')} />
          {form.formState.errors.prompt
            ? <p className="text-xs text-destructive">{form.formState.errors.prompt.message}</p>
            : null}
        </div>

        <SettingRow label="后台运行" description="不打断当前话题。">
          <Switch checked={background} onCheckedChange={setBackground} />
        </SettingRow>

        <Button onClick={onSubmit}>添加</Button>
      </SettingSection>

      <SettingSection title={`已有配方（${items.length}）`}>
        {items.length === 0
          ? <p className="text-sm text-muted-foreground">还没有配方。</p>
          : items.map((item: Recipe) => (
              <div key={item.id} className="flex items-start justify-between gap-4 border-b py-2 last:border-b-0">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{item.name}</span>
                    {item.source === 'model'
                      ? <span className="text-[10px] text-muted-foreground">角色提议</span>
                      : null}
                    {item.background
                      ? <span className="rounded-full border px-2 py-0.5 text-[10px]">后台</span>
                      : null}
                  </div>
                  {item.description ? <div className="text-xs text-muted-foreground">{item.description}</div> : null}
                  <div className="text-xs text-muted-foreground">{item.prompt}</div>
                  {item.keywords.length > 0
                    ? <div className="text-[10px] text-muted-foreground">代码词：{item.keywords.join('、')}</div>
                    : null}
                  {!item.approved
                    ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-amber-600">等待批准后才能启用</span>
                          <Button size="sm" variant="link" onClick={() => approve(item.id)}>批准</Button>
                        </div>
                      )
                    : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={item.enabled}
                    disabled={!item.approved}
                    onCheckedChange={enabled => setEnabled(item.id, enabled)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => remove(item.id)}>删除</Button>
                </div>
              </div>
            ))}
      </SettingSection>
    </div>
  )
}

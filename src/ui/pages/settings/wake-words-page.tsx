/**
 * 唤醒词设置页。
 */

import { useState } from 'react'

import { useHearingStore } from '@/config/domains/hearing'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Switch } from '@/ui/components/ui/switch'

export function WakeWordsPage() {
  const config = useHearingStore()
  const update = useHearingStore(state => state.update)
  const addWakeWord = useHearingStore(state => state.addWakeWord)
  const removeWakeWord = useHearingStore(state => state.removeWakeWord)
  const [draft, setDraft] = useState('')

  const add = () => {
    const word = draft.trim()
    if (!word)
      return
    addWakeWord(word)
    setDraft('')
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="唤醒词" description="说话命中列表里的词时开始一轮识别。">
        <SettingRow label="启用监听">
          <Switch checked={config.wakeEnabled} onCheckedChange={wakeEnabled => update({ wakeEnabled })} />
        </SettingRow>

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            placeholder="输入唤醒词"
            onChange={event => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter')
                add()
            }}
          />
          <Button onClick={add}>添加</Button>
        </div>

        {config.wakeWords.length === 0
          ? <p className="text-sm text-muted-foreground">还没有唤醒词。</p>
          : (
              <ul className="space-y-1">
                {config.wakeWords.map(word => (
                  <li key={word} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                    {word}
                    <Button size="sm" variant="ghost" onClick={() => removeWakeWord(word)}>删除</Button>
                  </li>
                ))}
              </ul>
            )}
      </SettingSection>
    </div>
  )
}

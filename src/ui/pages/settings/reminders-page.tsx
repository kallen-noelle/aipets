/**
 * 日程提醒设置页：开关、系统通知授权与提醒列表。
 */

import { useRemindersStore } from '@/config/domains/reminders'
import { SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Switch } from '@/ui/components/ui/switch'

function formatTime(at: number): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(at)
}

export function RemindersPage() {
  const enabled = useRemindersStore(state => state.enabled)
  const items = useRemindersStore(state => state.items)
  const update = useRemindersStore(state => state.update)
  const remove = useRemindersStore(state => state.remove)
  const markDone = useRemindersStore(state => state.markDone)
  const clearDone = useRemindersStore(state => state.clearDone)

  const sorted = [...items].sort((a, b) => a.at - b.at)
  const notificationSupported = typeof Notification !== 'undefined'

  return (
    <div className="max-w-2xl">
      <SettingSection
        title="日程提醒"
        description="角色可以用 add_reminder 记录提醒。到点后写入当前对话，并在允许时弹系统通知。"
      >
        <div className="flex items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="text-sm font-medium">启用提醒</div>
            <div className="text-xs text-muted-foreground">关闭后提醒工具从模型可用列表移除，已有条目不再触发。</div>
          </div>
          <Switch checked={enabled} onCheckedChange={value => update({ enabled: value })} />
        </div>

        <div className="flex items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="text-sm font-medium">系统通知</div>
            <div className="text-xs text-muted-foreground">
              {notificationSupported
                ? `当前权限：${Notification.permission}`
                : '当前环境不支持系统通知，只在对话里提示。'}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!notificationSupported || Notification.permission === 'granted'}
            onClick={() => void Notification.requestPermission()}
          >
            申请权限
          </Button>
        </div>
      </SettingSection>

      <SettingSection title="提醒列表" description="按时间排序；到点后仍保留，方便回看。">
        {sorted.length === 0
          ? <p className="text-sm text-muted-foreground">还没有提醒。可以让角色记一条，或在对话里说“十分钟后提醒我喝水”。</p>
          : (
              <div className="space-y-2">
                {sorted.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-1">
                      <div className={`text-sm ${item.done ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                        {item.text}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(item.at)}
                        {item.firedAt ? ' · 已提醒' : ''}
                        {item.done ? ' · 已完成' : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" disabled={item.done} onClick={() => markDone(item.id)}>
                        完成
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(item.id)}>
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

        {sorted.some(item => item.done)
          ? (
              <Button size="sm" variant="ghost" onClick={clearDone}>
                清除已完成
              </Button>
            )
          : null}
      </SettingSection>
    </div>
  )
}

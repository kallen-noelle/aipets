/**
 * 电池与电源：显示剩余电量与充电状态。
 *
 * 数据来自 `desktop/battery.ts`，组件只负责订阅与排版。
 */

import { useEffect, useState } from 'react'

import { watchBattery, type BatteryState } from '@/desktop/battery'
import { SettingSection } from '@/ui/components/setting-section'

export function BatteryCard() {
  const [battery, setBattery] = useState<BatteryState | null>(null)

  useEffect(() => watchBattery(setBattery), [])

  const percent = battery ? Math.round(battery.level * 100) : 0

  return (
    <SettingSection title="电池与电源" description="读取设备的供电状态。">
      {battery
        ? battery.supported
          ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>剩余电量</span>
                  <span className="font-semibold">{percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-[width]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {battery.charging ? '正在充电' : '使用电池供电'}
                </p>
              </div>
            )
          : <p className="text-sm text-muted-foreground">当前环境无法读取电池。</p>
        : <p className="text-sm text-muted-foreground">正在读取电池…</p>}
    </SettingSection>
  )
}

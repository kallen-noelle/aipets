/**
 * 天气设置：IP 定位、当前天气与手动刷新。
 */

import { useEffect, useState } from 'react'

import { useWeatherStore } from '@/config/domains/weather'
import { ensureWeatherFresh, refreshWeather } from '@/weather/service'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Switch } from '@/ui/components/ui/switch'

export function WeatherCard() {
  const weather = useWeatherStore()
  const update = useWeatherStore(state => state.update)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void ensureWeatherFresh()
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await refreshWeather()
    }
    finally {
      setRefreshing(false)
    }
  }

  return (
    <SettingSection title="天气" description="用 IP 粗略定位，数据来自 Open-Meteo，缓存 30 分钟。">
      <SettingRow label="启用天气" description="关闭后提示词不包含天气事实">
        <Switch checked={weather.enabled} onCheckedChange={enabled => update({ enabled })} />
      </SettingRow>

      <p className="text-sm text-muted-foreground">
        {weather.condition
          ? `${weather.city || '当前位置'} · ${weather.condition}${weather.temperatureC === null ? '' : ` · ${Math.round(weather.temperatureC)}°C`}`
          : '还没有天气数据'}
      </p>

      {weather.updatedAt
        ? (
            <p className="text-xs text-muted-foreground">
              更新于 {new Date(weather.updatedAt).toLocaleTimeString()}
            </p>
          )
        : null}

      {weather.error ? <p className="text-xs text-destructive">天气获取失败：{weather.error}</p> : null}

      <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void refresh()}>
        {refreshing ? '刷新中…' : '刷新天气'}
      </Button>
    </SettingSection>
  )
}

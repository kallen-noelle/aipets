/**
 * 天气模块页：复用动画设置里的天气卡片。
 *
 * 天气不是工具，而是每轮对话前写入提示词的环境事实，所以形态标为
 * middleware：数据由状态提供者读取。
 */

import { WeatherCard } from '@/ui/components/animation/weather-card'

export function WeatherPage() {
  return (
    <div className="max-w-2xl">
      <WeatherCard />
      <p className="text-xs text-muted-foreground">
        天气作为环境事实注入每一轮对话，角色会据此选择室内或户外的动作。
      </p>
    </div>
  )
}

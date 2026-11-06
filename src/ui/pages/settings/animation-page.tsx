/**
 * 动画导演设置页：导演模型、好感度、天气与环境编排。
 */

import { AffinityCard } from '@/ui/components/animation/affinity-card'
import { AmbientCard } from '@/ui/components/animation/ambient-card'
import { DirectorModelCard } from '@/ui/components/animation/director-model-card'
import { WeatherCard } from '@/ui/components/animation/weather-card'

export function AnimationPage() {
  return (
    <div className="max-w-2xl">
      <DirectorModelCard />
      <AffinityCard />
      <WeatherCard />
      <AmbientCard />
    </div>
  )
}

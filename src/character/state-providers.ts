/**
 * 内置状态提供者：时间、天气、电量、好感度。
 *
 * 提示文本描述事实对动作选择的影响，最终选片由模型完成。
 */

import { affinityOf } from '@/config/domains/affinity'
import { useWeatherStore } from '@/config/domains/weather'
import { currentBattery } from '@/desktop/battery'
import { ensureWeatherFresh } from '@/weather/service'

import {
  registerCharacterStateProvider,
  registerWorldStateProvider,
  type StateEntry,
} from './state-context'

function timeGuidance(hour: number): string {
  if (hour >= 5 && hour < 9)
    return '清晨，适合起床、梳洗、早餐类动作。'
  if (hour >= 9 && hour < 12)
    return '上午，适合工作、学习、家务类动作。'
  if (hour >= 12 && hour < 14)
    return '中午，适合吃饭、休息类动作。'
  if (hour >= 14 && hour < 18)
    return '下午，适合活动、娱乐、户外类动作。'
  if (hour >= 18 && hour < 22)
    return '傍晚，适合晚餐、放松、聊天类动作。'

  return '深夜，适合困倦、休息、安静类动作。'
}

function weatherGuidance(condition: string, temperature: number | null): string {
  if (!condition)
    return '天气未知，不要据此选择户外动作。'
  if (condition.includes('雨') || condition.includes('雪') || condition === '雾')
    return '不适合户外，优先室内、安静类动作。'
  if (temperature !== null && temperature >= 30)
    return '高温，避免剧烈动作，优先纳凉、休息类动作。'
  if (temperature !== null && temperature <= 5)
    return '低温，避免长时间户外，优先保暖、室内类动作。'

  return '天气适合户外，可考虑活动、散步类动作。'
}

function affinityGuidance(value: number): string {
  if (value >= 80)
    return '好感度很高，可以亲近、撒娇、主动靠近。'
  if (value >= 60)
    return '好感度较高，可以友好、配合。'
  if (value >= 40)
    return '好感度一般，保持自然。'

  return '好感度偏低，保持距离与礼貌。'
}

let registered = false

/** 注册内置提供者，重复调用只生效一次。 */
export function registerDefaultStateProviders(): void {
  if (registered)
    return
  registered = true

  registerWorldStateProvider((context) => {
    const hour = context.now.getHours()
    return {
      label: '当前时间',
      value: new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeStyle: 'short' })
        .format(context.now),
      guidance: timeGuidance(hour),
    }
  })

  registerWorldStateProvider(() => {
    // 提示词只读缓存；天气刷新在后台进行，避免阻塞导演请求。
    void ensureWeatherFresh()
    const weather = useWeatherStore.getState()
    const value = weather.enabled
      ? (weather.condition
          ? `${weather.city || '当前位置'} ${weather.condition}${weather.temperatureC === null ? '' : ` ${Math.round(weather.temperatureC)}°C`}`
          : '未知')
      : '已关闭'

    return {
      label: '天气',
      value,
      guidance: weather.enabled
        ? weatherGuidance(weather.condition, weather.temperatureC)
        : '天气功能已关闭，不要据此选择动作。',
    }
  })

  registerCharacterStateProvider((): StateEntry => {
    const battery = currentBattery()
    if (!battery || !battery.supported) {
      return {
        label: '设备电量',
        value: '未知',
        guidance: '无法读取电量，不要据此选择动作。',
      }
    }

    const percent = Math.round(battery.level * 100)
    return {
      label: '设备电量',
      value: `${percent}%${battery.charging ? '，正在充电' : ''}`,
      guidance: battery.charging
        ? '正在充电，可以活跃一些。'
        : percent <= 20
          ? '电量低，动作放缓，避免大幅表演。'
          : '电量正常，不必限制动作。',
    }
  })

  registerCharacterStateProvider(context => ({
    label: '好感度',
    value: `${affinityOf(context.characterId)}/100`,
    guidance: affinityGuidance(affinityOf(context.characterId)),
  }))
}

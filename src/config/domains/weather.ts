/**
 * 天气域：IP 定位、当前天气与刷新状态。
 *
 * 事实由天气服务写入，状态提供者与设置页只读取。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const weatherSchema = z.object({
  enabled: z.boolean(),
  city: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** 中文天气描述，例如“晴”。 */
  condition: z.string(),
  /** WMO 天气代码，未知时为 null。 */
  code: z.number().nullable(),
  temperatureC: z.number().nullable(),
  updatedAt: z.number(),
  /** 最后一次尝试时间，失败也算，避免反复请求。 */
  checkedAt: z.number(),
  error: z.string(),
})

export type WeatherConfig = z.infer<typeof weatherSchema>

interface WeatherState extends WeatherConfig {
  update: (patch: Partial<WeatherConfig>) => void
}

export const useWeatherStore = create<WeatherState>()(
  persist(
    set => ({
      enabled: true,
      city: '',
      latitude: null,
      longitude: null,
      condition: '',
      code: null,
      temperatureC: null,
      updatedAt: 0,
      checkedAt: 0,
      error: '',
      update: patch => set(patch),
    }),
    persistOptions<WeatherState>('weather'),
  ),
)

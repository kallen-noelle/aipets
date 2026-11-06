/**
 * 天气服务：IP 定位后向 Open-Meteo 取当前天气。
 *
 * 成功时写入天气域；失败时保留上一次结果并记录错误。
 */

import axios from 'axios'

import { useWeatherStore } from '@/config/domains/weather'

const IPINFO_URL = 'https://ipinfo.io/json'
const IPWHO_URL = 'https://ipwho.is/'
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'
const FRESH_MS = 30 * 60 * 1000
/** 失败后至少等这么久再自动重试，避免 429 后半小时都用不到天气。 */
const FAIL_RETRY_MS = 60 * 1000

interface IpInfoResponse {
  city?: string
  region?: string
  loc?: string
}

interface IpWhoResponse {
  success?: boolean
  latitude?: number
  longitude?: number
  city?: string
}

interface WeatherResponse {
  current_weather?: {
    temperature?: number
    weathercode?: number
  }
}

/** WMO 天气代码转中文描述。 */
export function weatherCondition(code: number): string {
  if (code === 0)
    return '晴'
  if (code === 1 || code === 2)
    return '少云'
  if (code === 3)
    return '阴'
  if (code === 45 || code === 48)
    return '雾'
  if (code >= 51 && code <= 57)
    return '毛毛雨'
  if (code >= 61 && code <= 67)
    return '雨'
  if (code >= 71 && code <= 77)
    return '雪'
  if (code >= 80 && code <= 82)
    return '阵雨'
  if (code === 85 || code === 86)
    return '阵雪'
  if (code >= 95)
    return '雷雨'

  return '未知'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

async function locateWithIpInfo(): Promise<{ latitude: number, longitude: number, city: string }> {
  const response = await axios.get<IpInfoResponse>(IPINFO_URL, { timeout: 12_000 })
  const [latText = '', lonText = ''] = (response.data.loc ?? '').split(',')
  const latitude = Number(latText)
  const longitude = Number(lonText)
  if (!latText || !lonText || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    throw new Error('IP 定位失败')

  return {
    latitude,
    longitude,
    city: response.data.city ?? '',
  }
}

async function locateWithIpWho(): Promise<{ latitude: number, longitude: number, city: string }> {
  const response = await axios.get<IpWhoResponse>(IPWHO_URL, { timeout: 12_000 })
  const data = response.data
  if (data.success === false || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude))
    throw new Error('IP 定位失败')

  return {
    latitude: data.latitude!,
    longitude: data.longitude!,
    city: data.city ?? '',
  }
}

/** ipinfo 作为主定位，失败时退回 ipwho。ipwho 常年 429，不能放在前面。 */
async function locate(): Promise<{ latitude: number, longitude: number, city: string }> {
  try {
    return await locateWithIpInfo()
  }
  catch (primaryError) {
    try {
      return await locateWithIpWho()
    }
    catch {
      throw primaryError
    }
  }
}

/** 强制刷新天气，失败时写入错误信息。 */
export async function refreshWeather(): Promise<void> {
  const store = useWeatherStore.getState()
  if (!store.enabled)
    return

  try {
    const stored = store.latitude !== null && store.longitude !== null
      ? { latitude: store.latitude, longitude: store.longitude, city: store.city }
      : await locate()

    const response = await axios.get<WeatherResponse>(WEATHER_URL, {
      timeout: 12_000,
      params: {
        latitude: stored.latitude,
        longitude: stored.longitude,
        current_weather: true,
        timezone: 'auto',
      },
    })

    const current = response.data.current_weather
    if (!current || !Number.isFinite(current.weathercode))
      throw new Error('天气数据为空')

    useWeatherStore.getState().update({
      ...stored,
      condition: weatherCondition(current.weathercode!),
      code: current.weathercode!,
      temperatureC: Number.isFinite(current.temperature) ? current.temperature! : null,
      updatedAt: Date.now(),
      checkedAt: Date.now(),
      error: '',
    })
  }
  catch (error) {
    useWeatherStore.getState().update({ error: errorText(error), checkedAt: Date.now() })
  }
}

/** 成功缓存 30 分钟；失败只等 1 分钟，避免 429 后长时间拿不到天气。 */
export async function ensureWeatherFresh(): Promise<void> {
  const store = useWeatherStore.getState()
  if (!store.enabled)
    return

  if (store.checkedAt) {
    const wait = store.error ? FAIL_RETRY_MS : FRESH_MS
    if (Date.now() - store.checkedAt < wait)
      return
  }

  await refreshWeather()
}

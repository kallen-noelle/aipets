/**
 * 电池状态读取。
 *
 * Chromium 在网页与桌面外壳里都提供电池接口；接口缺失时报告不支持。
 */

export interface BatteryState {
  supported: boolean
  charging: boolean
  /** 剩余电量，0 到 1。 */
  level: number
}

interface BatteryManagerLike {
  charging: boolean
  level: number
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

interface BatteryNavigator {
  getBattery?: () => Promise<BatteryManagerLike>
}

/**
 * 订阅电池变化，返回取消函数。
 *
 * 第一次读取是异步的，接口缺失时立即回调一次不支持的状态。
 */
export function watchBattery(listener: (state: BatteryState) => void): () => void {
  const source = navigator as Navigator & BatteryNavigator
  if (typeof source.getBattery !== 'function') {
    listener({ supported: false, charging: false, level: 0 })
    return () => {}
  }

  let manager: BatteryManagerLike | null = null
  let disposed = false

  const update = () => {
    if (manager && !disposed)
      listener({ supported: true, charging: manager.charging, level: manager.level })
  }

  void source.getBattery().then((next) => {
    if (disposed)
      return

    manager = next
    update()
    manager.addEventListener('levelchange', update)
    manager.addEventListener('chargingchange', update)
  }).catch(() => {
    if (!disposed)
      listener({ supported: false, charging: false, level: 0 })
  })

  return () => {
    disposed = true
    manager?.removeEventListener('levelchange', update)
    manager?.removeEventListener('chargingchange', update)
    manager = null
  }
}

let cachedBattery: BatteryState | null = null
let batteryWatcherStarted = false

/**
 * 读取最近一次电池状态，供提示词等同步场景使用。
 *
 * 第一次调用时才开始订阅，应用生命周期内保持。
 */
export function currentBattery(): BatteryState | null {
  if (!batteryWatcherStarted) {
    batteryWatcherStarted = true
    watchBattery(state => {
      cachedBattery = state
    })
  }

  return cachedBattery
}

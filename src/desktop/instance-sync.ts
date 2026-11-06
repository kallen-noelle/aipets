/**
 * 桌面实例同步：把启用的角色实例交给主进程。
 *
 * 主进程为每个实例维护一个桌宠窗口，实例增减或显示开关变化后立即同步。
 * 网页版没有桌面桥，直接跳过。
 */

import { useCharacterStore } from '@/config/domains/character'

import { getDesktopBridge } from './bridge'

let started = false

/** 在应用启动时调用一次。 */
export function enableDesktopInstanceSync(): void {
  if (started)
    return

  const bridge = getDesktopBridge()
  if (!bridge)
    return

  started = true
  let last = ''

  const push = () => {
    const ids = useCharacterStore.getState().instances
      .filter(item => item.enabled)
      .map(item => item.id)
    const key = ids.join('|')
    if (key === last)
      return

    last = key
    void bridge.syncPetInstances(ids)
  }

  push()
  useCharacterStore.subscribe(push)
}

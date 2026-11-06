/**
 * 桌面版桌宠窗口页面。
 *
 * 每个窗口只显示主进程分配的一个实例；窗口本身就是角色的相框，
 * 拖拽移动的是窗口，缩放也通过主进程调整窗口大小。
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useCharacterStore } from '@/config/domains/character'
import { getDesktopBridge } from '@/desktop/bridge'
import { CharacterStage } from '@/ui/components/character-stage'

export function DesktopPetPage() {
  const [searchParams] = useSearchParams()
  const queryInstanceId = searchParams.get('instance')
  const [assignedId, setAssignedId] = useState<string | null>(null)
  const bridge = getDesktopBridge()
  const instances = useCharacterStore(state => state.instances)

  useEffect(() => {
    if (!bridge || queryInstanceId)
      return

    let disposed = false
    // 先订阅再查询，占位窗口被接管时不会错过通知。
    const off = bridge.onPetAssigned((id) => {
      if (!disposed)
        setAssignedId(id)
    })
    void bridge.getPetInstanceId().then((id) => {
      if (!disposed && id)
        setAssignedId(id)
    })

    return () => {
      disposed = true
      off()
    }
  }, [bridge, queryInstanceId])

  const instanceId = queryInstanceId ?? assignedId
  const instance = instances.find(item => item.id === instanceId)

  if (!instance)
    return null

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="h-full w-full">
        <CharacterStage
          characterId={instance.characterId}
          appearance={instance.appearance}
          instanceId={instance.id}
          interactive
          windowDrag
        />
      </div>
    </div>
  )
}

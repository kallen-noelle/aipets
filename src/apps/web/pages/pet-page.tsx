/**
 * 网页版桌宠页。
 *
 * 浏览器里没有独立窗口，角色平铺在页面内，可以用鼠标在舞台内拖动。
 * 桌面版有独立的桌宠窗口，不使用这个页面。
 */

import { useCharacterStore } from '@/config/domains/character'
import { CharacterStage } from '@/ui/components/character-stage'
import { PetToolbar } from '@/ui/components/pet-toolbar'

export function WebPetPage() {
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const enabledInstances = instances.filter(item => item.enabled)

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {enabledInstances.map(instance => (
        <div
          key={instance.id}
          className={enabledInstances.length > 1
            ? 'absolute inset-y-0 left-1/2 w-[min(100vw,340px)] -translate-x-1/2'
            : 'absolute inset-0'}
        >
          <CharacterStage
            characterId={instance.characterId}
            appearance={instance.appearance}
            instanceId={instance.id}
            interactive={instance.id === activeInstanceId}
          />
        </div>
      ))}
      <PetToolbar />
    </div>
  )
}

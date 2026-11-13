/**
 * 网页启动时按角色索引补齐默认实例。
 *
 * 只有用户从未自定义过实例（仍是单个 instance-main）时才会展开成索引里的
 * 全部角色；用户手动增删过实例后不再自动补全。
 *
 * 资源索引加载失败时保留现有实例，舞台组件会自行重试并显示错误。
 */

import { useCharacterStore } from '@/config/domains/character'

import { loadCharactersCatalog } from './catalog'

export async function seedDefaultInstances(): Promise<void> {
  try {
    const catalog = await loadCharactersCatalog()
    useCharacterStore.getState().seedInstances(catalog.characters.map(item => item.id))
  }
  catch {
    // 索引暂不可用时保留默认实例。
  }
}

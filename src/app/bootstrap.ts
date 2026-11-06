/**
 * 两个入口共用的启动流程。
 *
 * 主题、跨窗口同步与天气刷新对网页版和桌面版都是同一套逻辑。
 * 桌面专属的实例同步由桌面入口自行调用，网页入口不接触桌面模块。
 */

import { enableCrossWindowSync } from '@/config/cross-window'
import { applyTheme, useUiStore, watchSystemTheme } from '@/config/domains/ui'
import { ensureWeatherFresh } from '@/weather/service'

export function bootstrap(): void {
  // 主题在首帧前写入根节点，避免出现一次闪烁。
  applyTheme(useUiStore.getState().theme)
  // 其他窗口切换主题后，本窗口同步根节点属性。
  useUiStore.subscribe(state => applyTheme(state.theme))
  // 跟随系统时，系统明暗变化立即生效。
  watchSystemTheme()
  // 窗口间共享配置，角色与缩放改动立即生效。
  enableCrossWindowSync()
  // 天气只影响提示词，启动时后台刷新一次。
  void ensureWeatherFresh()
}

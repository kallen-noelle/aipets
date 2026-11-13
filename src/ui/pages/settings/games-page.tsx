/**
 * 游戏模块页：如实说明尚未接入的部分。
 *
 * 游戏需要独立的前端运行时与规则引擎，当前工程没有可复用的游戏容器，
 * 因此不提供只有开关没有任何行为的空壳页面。
 */

import { SettingSection } from '@/ui/components/setting-section'

export function GamesPage() {
  return (
    <div className="max-w-2xl">
      <SettingSection title="游戏" description="未接入。">
        <p className="text-sm text-muted-foreground">
          缺少的东西：小游戏运行时（画布、规则循环与输入处理）以及游戏容器界面。
          现有工程只有角色舞台与聊天窗，没有可以承载棋牌、猜谜等玩法的渲染层。
        </p>
        <p className="text-sm text-muted-foreground">
          计划：先确定一到两个玩法的规则数据结构，再新增独立的游戏组件；模型通过
          tool 发起对局，游戏状态由前端维护。在此之前这里保持不可用。
        </p>
      </SettingSection>
    </div>
  )
}

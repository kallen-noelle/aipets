/**
 * 设置页注册表。
 *
 * 侧栏只放顶层入口，模块页从“模块”首页进入，与原网页版的组织方式一致。
 */

import type { LucideIcon } from 'lucide-react'

import { Clapperboard, Cpu, Database, KeyRound, LayoutGrid, Monitor, Puzzle, Radio, Settings2, User } from 'lucide-react'

export interface SettingsEntry {
  id: string
  path: string
  title: string
  description: string
  icon: LucideIcon
}

export interface SettingsGroup {
  title: string
  items: SettingsEntry[]
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: '角色',
    items: [
      { id: 'card', path: '/settings/card', title: '角色卡', description: '名称、人设与聊天模型', icon: User },
      { id: 'data', path: '/settings/data', title: '数据', description: '导入、导出与重置', icon: Database },
      { id: 'models', path: '/settings/models', title: '模型', description: '对话模型与角色外观', icon: Cpu },
      { id: 'animation', path: '/settings/animation', title: '动画', description: '导演模型、好感度、天气与环境编排', icon: Clapperboard },
      { id: 'providers', path: '/settings/providers', title: '模型提供商', description: '接口地址、密钥与激活', icon: KeyRound },
    ],
  },
  {
    title: '模块',
    items: [
      { id: 'modules', path: '/settings/modules', title: '模块', description: '语音、意识、视觉、记忆等', icon: LayoutGrid },
    ],
  },
  {
    title: '连接',
    items: [
      { id: 'connection', path: '/settings/connection', title: '连接', description: '事件中继服务地址', icon: Radio },
    ],
  },
  {
    title: '桌面',
    items: [
      { id: 'desktop', path: '/settings/desktop', title: '桌面', description: '窗口、托盘与音频设备', icon: Monitor },
      { id: 'plugins', path: '/settings/plugins', title: '插件', description: '本地插件宿主', icon: Puzzle },
    ],
  },
  {
    title: '系统',
    items: [
      { id: 'system', path: '/settings/system', title: '系统', description: '主题与运行环境', icon: Settings2 },
    ],
  },
]

/** 顶层入口，设置首页与侧栏共用。 */
export const SETTINGS_ENTRIES: SettingsEntry[] = SETTINGS_GROUPS.flatMap(group => group.items)

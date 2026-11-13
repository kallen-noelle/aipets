/**
 * 模块页注册表：模块首页、侧边栏与设置子路由都从这里派生。
 *
 * 加一个模块只需要在这里补一条：路径、标题、分类与页面组件同时生效，
 * 不再需要在注册表和路由表里各写一遍。paths 使用 `/settings/` 开头的完整
 * 路径，路由派生时再去掉前缀。
 */

import type { ComponentType } from 'react'

import { AnimationPage } from './animation-page'
import { BeatSyncPage } from './beat-sync-page'
import { CodeToolsPage } from './code-tools-page'
import { ConsciousnessPage } from './consciousness-page'
import { GamesPage } from './games-page'
import { HearingPage } from './hearing-page'
import { HomeAssistantPage } from './home-assistant-page'
import { ImagePage } from './image-page'
import { McpPage } from './mcp-page'
import { MemoryLongTermPage } from './memory-long-term-page'
import { MemoryPage } from './memory-page'
import { MemoryShortTermPage } from './memory-short-term-page'
import { PianoPage, SingingPage } from './music-page'
import { RecipesPage } from './recipes-page'
import { RemindersPage } from './reminders-page'
import { SpeechPage } from './speech-page'
import { StatusPage } from './status-page'
import { StickersPage } from './stickers-page'
import { ToolCardsPage } from './tool-cards-page'
import { TouchPage } from './touch-page'
import { TranscriberPage } from './transcriber-page'
import { VisionPage } from './vision-page'
import { VoiceprintPage } from './voiceprint-page'
import { WakeWordsPage } from './wake-words-page'
import { WeatherPage } from './weather-page'
import { WebSearchPage } from './web-search-page'

/**
 * 模块分组：身体模块常驻对话主链路，能力模块按需触发。
 */
export type ModuleGroup = 'body' | 'capability'

/**
 * 模块接入形态。
 *
 * - middleware：横切每一轮对话，例如记忆注入；
 * - tool：模型可主动调用，例如搜索、画画；
 * - mcp：外部服务，走 MCP server；
 * - inline：无法抽象成前三种的身体模块实现，例如音频管线、渲染循环。
 */
export type ModuleForm = 'middleware' | 'tool' | 'mcp' | 'inline'

export const MODULE_GROUPS: Array<{ id: ModuleGroup, title: string, description: string }> = [
  { id: 'body', title: '身体模块', description: '常驻对话主链路的通道型能力：听、说、看、记忆、表情、动作、触觉、状态。' },
  { id: 'capability', title: '能力模块', description: '按需触发、可独立开关的技能。' },
]

export interface ModuleEntry {
  id: string
  /** 完整路径，例如 /settings/modules/stickers。 */
  path: string
  title: string
  description: string
  /** 机能分组；不填表示不属于机能模块（例如聊天模型、展示方式、连接）。 */
  group?: ModuleGroup
  /** 接入形态；新增能力时按它决定落到中间件、工具还是 MCP。 */
  form?: ModuleForm
  /** 已复刻或仍待补齐。 */
  ready: boolean
  /** 页面对应的组件，路由由它派生。 */
  element: ComponentType
}

export const MODULE_ENTRIES: ModuleEntry[] = [
  { id: 'consciousness', path: '/settings/modules/consciousness', title: '意识', description: '对话模型、温度与 Top P', ready: true, element: ConsciousnessPage },
  { id: 'vision', path: '/settings/modules/vision', title: '视觉', description: '图片理解模型', group: 'body', form: 'inline', ready: true, element: VisionPage },
  { id: 'web-search', path: '/settings/modules/web-search', title: '网络搜索', description: 'Tavily 搜索工具', group: 'capability', form: 'tool', ready: true, element: WebSearchPage },
  { id: 'tool-cards', path: '/settings/modules/tool-cards', title: '工具卡片', description: '工具调用结果的展示方式', ready: true, element: ToolCardsPage },
  { id: 'home-assistant', path: '/settings/modules/home-assistant', title: '家庭助手', description: 'Home Assistant 地址与令牌', group: 'capability', form: 'tool', ready: true, element: HomeAssistantPage },

  { id: 'speech', path: '/settings/modules/speech', title: '语音合成', description: '接口朗读与系统语音', group: 'body', form: 'inline', ready: true, element: SpeechPage },
  { id: 'hearing', path: '/settings/modules/hearing', title: '语音识别', description: '本地识别与接口转写', group: 'body', form: 'inline', ready: true, element: HearingPage },
  { id: 'transcriber', path: '/settings/modules/hearing/transcriber', title: '转写与改写', description: '转写模型与文本改写', group: 'body', form: 'inline', ready: true, element: TranscriberPage },
  { id: 'wake-words', path: '/settings/modules/hearing/wake-words', title: '唤醒词', description: '监听与唤醒词列表', group: 'body', form: 'inline', ready: true, element: WakeWordsPage },
  { id: 'voiceprint', path: '/settings/modules/hearing/voiceprint', title: '声纹', description: '声纹识别与登记', group: 'body', form: 'inline', ready: true, element: VoiceprintPage },
  { id: 'beat-sync', path: '/settings/modules/beat-sync', title: '节拍同步', description: '麦克风节拍检测参数', group: 'body', form: 'inline', ready: true, element: BeatSyncPage },

  { id: 'stickers', path: '/settings/modules/stickers', title: '表情', description: '回复表情包与本地表情库', group: 'body', form: 'inline', ready: true, element: StickersPage },
  { id: 'touch', path: '/settings/modules/touch', title: '触觉', description: '点击反应与拖拽', group: 'body', form: 'inline', ready: true, element: TouchPage },
  { id: 'status', path: '/settings/modules/status', title: '状态', description: '好感度与内在状态', group: 'body', form: 'inline', ready: true, element: StatusPage },
  { id: 'artistry', path: '/settings/modules/artistry', title: '画画', description: '图片生成模型', group: 'capability', form: 'tool', ready: true, element: ImagePage },
  { id: 'piano', path: '/settings/modules/piano', title: '弹琴', description: '按曲谱用 Web Audio 合成演奏', group: 'capability', form: 'tool', ready: true, element: PianoPage },
  { id: 'singing', path: '/settings/modules/singing', title: '唱歌', description: '合成旋律并显示歌词', group: 'capability', form: 'tool', ready: true, element: SingingPage },
  { id: 'reminders', path: '/settings/modules/reminders', title: '日程提醒', description: '一次性提醒与到点通知', group: 'capability', form: 'tool', ready: true, element: RemindersPage },
  { id: 'weather', path: '/settings/modules/weather', title: '天气', description: '环境事实与刷新', group: 'capability', form: 'middleware', ready: true, element: WeatherPage },
  { id: 'code-tools', path: '/settings/modules/code-tools', title: '代码与工具', description: '通过 MCP 接入命令与文件能力', group: 'capability', form: 'mcp', ready: true, element: CodeToolsPage },
  { id: 'games', path: '/settings/modules/games', title: '游戏', description: '小游戏玩法（未接入）', group: 'capability', form: 'tool', ready: false, element: GamesPage },
  { id: 'animation', path: '/settings/animation', title: '动画导演', description: '动作编排模型', group: 'body', form: 'inline', ready: true, element: AnimationPage },

  { id: 'memory-short-term', path: '/settings/modules/memory-short-term', title: '短期记忆', description: '发送历史与保留轮数', group: 'body', form: 'middleware', ready: true, element: MemoryShortTermPage },
  { id: 'memory-long-term', path: '/settings/modules/memory-long-term', title: '长期记忆', description: '记忆开关与入口', group: 'body', form: 'middleware', ready: true, element: MemoryLongTermPage },
  { id: 'memories', path: '/settings/modules/memory-long-term/memories', title: '记忆条目', description: '增删改查记忆', group: 'body', form: 'middleware', ready: true, element: MemoryPage },
  { id: 'recipes', path: '/settings/modules/memory-long-term/recipes', title: '配方', description: '提示词配方', group: 'body', form: 'middleware', ready: true, element: RecipesPage },

  { id: 'mcp', path: '/settings/modules/mcp', title: 'MCP', description: 'MCP 服务器与工具', form: 'mcp', ready: true, element: McpPage },
]

/** 把注册表里的完整路径转成设置布局下的相对路径。 */
export function moduleRoutePath(path: string): string {
  return path.replace(/^\/settings\//, '')
}

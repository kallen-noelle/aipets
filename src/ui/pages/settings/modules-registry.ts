/**
 * 模块页注册表：模块首页按分类展示，右侧页面直接读这里。
 */

export interface ModuleEntry {
  id: string
  path: string
  title: string
  description: string
  category: string
  /** 已复刻或仍待补齐。 */
  ready: boolean
}

export const MODULE_ENTRIES: ModuleEntry[] = [
  { id: 'consciousness', path: '/settings/modules/consciousness', title: '意识', description: '对话模型、温度与 Top P', category: '对话', ready: true },
  { id: 'vision', path: '/settings/modules/vision', title: '视觉', description: '图片理解模型', category: '对话', ready: true },
  { id: 'web-search', path: '/settings/modules/web-search', title: '网络搜索', description: 'Tavily 搜索工具', category: '对话', ready: true },
  { id: 'tool-cards', path: '/settings/modules/tool-cards', title: '工具卡片', description: '工具调用结果的展示方式', category: '对话', ready: true },
  { id: 'home-assistant', path: '/settings/modules/home-assistant', title: '家庭助手', description: 'Home Assistant 地址与令牌', category: '对话', ready: true },

  { id: 'speech', path: '/settings/modules/speech', title: '语音合成', description: '接口朗读与系统语音', category: '语音', ready: true },
  { id: 'hearing', path: '/settings/modules/hearing', title: '语音识别', description: '本地识别与接口转写', category: '语音', ready: true },
  { id: 'transcriber', path: '/settings/modules/hearing/transcriber', title: '转写与改写', description: '转写模型与文本改写', category: '语音', ready: true },
  { id: 'wake-words', path: '/settings/modules/hearing/wake-words', title: '唤醒词', description: '监听与唤醒词列表', category: '语音', ready: true },
  { id: 'voiceprint', path: '/settings/modules/hearing/voiceprint', title: '声纹', description: '声纹识别与登记', category: '语音', ready: true },
  { id: 'beat-sync', path: '/settings/modules/beat-sync', title: '节拍同步', description: '麦克风节拍检测参数', category: '语音', ready: true },

  { id: 'stickers', path: '/settings/modules/stickers', title: '贴纸', description: '回复贴纸与贴纸库', category: '表达', ready: true },
  { id: 'artistry', path: '/settings/modules/artistry', title: '图像', description: '图片生成模型', category: '表达', ready: true },
  { id: 'animation', path: '/settings/animation', title: '动画导演', description: '动作编排模型', category: '表达', ready: true },

  { id: 'memory-short-term', path: '/settings/modules/memory-short-term', title: '短期记忆', description: '发送历史与保留轮数', category: '记忆', ready: true },
  { id: 'memory-long-term', path: '/settings/modules/memory-long-term', title: '长期记忆', description: '记忆开关与入口', category: '记忆', ready: true },
  { id: 'memories', path: '/settings/modules/memory-long-term/memories', title: '记忆条目', description: '增删改查记忆', category: '记忆', ready: true },
  { id: 'recipes', path: '/settings/modules/memory-long-term/recipes', title: '配方', description: '提示词配方', category: '记忆', ready: true },

  { id: 'mcp', path: '/settings/modules/mcp', title: 'MCP', description: 'MCP 服务器与工具', category: '连接', ready: true },
]

export const MODULE_CATEGORIES = ['对话', '语音', '表达', '记忆', '连接']

/**
 * 系统提示词组装。
 *
 * 人设来自角色索引，配方是可选附加段落。长期记忆不再拼进这里，改为由
 * memory 中间件作为独立系统片段注入。
 */

/** 交给角色挑选的表情摘要，避免 prompt 层依赖完整的表情数据结构。 */
export interface StickerHint {
  name: string
  tags: string[]
}

export function buildSystemPrompt(
  name: string,
  persona: string,
  recipe = '',
  stickers: StickerHint[] = [],
): string {
  const sections: string[] = []

  if (name.trim())
    sections.push(`你的名字是 ${name.trim()}。`)

  if (persona.trim())
    sections.push(persona.trim())

  if (recipe.trim())
    sections.push(`本轮额外要求：\n${recipe.trim()}`)

  // 频率已经在外面掷过骰，这里只负责让角色判断语境是否合适。
  if (stickers.length > 0) {
    const list = stickers
      .map(item => item.tags.length > 0 ? `${item.name}（${item.tags.join('、')}）` : item.name)
      .join('；')
    sections.push(
      `本轮可以附一张表情包。可用表情：${list}。`
      + '只有当前回复的情绪与某张表情贴切时，才在回复最后单独一行输出 [[sticker:表情名]]；不合适就不要输出。',
    )
  }

  sections.push('用中文回答，尽量简短。')

  return sections.join('\n\n')
}

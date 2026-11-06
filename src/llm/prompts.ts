/**
 * 系统提示词组装。
 *
 * 人设来自角色索引，记忆来自 memory 域，配方是可选附加段落。
 */

export function buildSystemPrompt(
  name: string,
  persona: string,
  memories: string,
  recipe = '',
): string {
  const sections: string[] = []

  if (name.trim())
    sections.push(`你的名字是 ${name.trim()}。`)

  if (persona.trim())
    sections.push(persona.trim())

  if (recipe.trim())
    sections.push(`本轮额外要求：\n${recipe.trim()}`)

  if (memories.trim())
    sections.push(`你记得关于主人的事：\n${memories.trim()}`)

  sections.push('用中文回答，尽量简短。')

  return sections.join('\n\n')
}

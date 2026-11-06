/**
 * 内置工具：网络搜索与家庭助手。
 *
 * 只有启用并配置好密钥时才加入对话，否则不产生工具。
 */

import { tool } from 'langchain'
import { z } from 'zod'
import axios from 'axios'

import { useAffinityStore } from '@/config/domains/affinity'
import { useHomeAssistantStore } from '@/config/domains/home-assistant'
import { useRecipesStore } from '@/config/domains/recipes'
import { useWebSearchStore } from '@/config/domains/web-search'
import type { AgentTool } from '@/mcp/tools'

/** Tavily 搜索结果。 */
interface TavilyResponse {
  answer?: string
  results?: Array<{ title?: string, url?: string, content?: string }>
}

function webSearchTool(): AgentTool {
  const { apiKey } = useWebSearchStore.getState()

  return tool(
    async ({ query, maxResults }) => {
      const response = await axios.post<TavilyResponse>(
        'https://api.tavily.com/search',
        { api_key: apiKey, query, max_results: maxResults, include_answer: true },
        { timeout: 20_000 },
      )

      const data = response.data
      if (data.answer)
        return `摘要：${data.answer}`

      const lines = (data.results ?? []).map(item => `- ${item.title ?? ''}：${item.content ?? ''}（${item.url ?? ''}）`)
      return lines.join('\n') || '没有搜索结果'
    },
    {
      name: 'web_search',
      description: '在网络上搜索实时信息，输入查询词。',
      schema: z.object({
        query: z.string().describe('搜索关键词'),
        maxResults: z.number().min(1).max(10).default(5).describe('返回结果数量'),
      }),
    },
  )
}

function homeAssistantTool(): AgentTool {
  const { baseUrl, token } = useHomeAssistantStore.getState()
  const base = baseUrl.replace(/\/+$/, '')

  return tool(
    async ({ query }) => {
      const response = await axios.get<Array<{ entity_id: string, state: string, attributes?: { friendly_name?: string } }>>(
        `${base}/api/states`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 20_000 },
      )

      const matched = response.data
        .filter(item => item.entity_id.includes(query) || (item.attributes?.friendly_name ?? '').includes(query))
        .slice(0, 10)
        .map(item => `- ${item.attributes?.friendly_name ?? item.entity_id}：${item.state}`)

      return matched.join('\n') || '没有匹配的实体'
    },
    {
      name: 'home_assistant_states',
      description: '查询 Home Assistant 实体状态，输入实体名或关键词。',
      schema: z.object({ query: z.string().describe('实体名或关键词') }),
    },
  )
}

/** 让角色把可复用的规则提成配方；提议写入后等待主人批准。 */
function proposeRecipeTool(): AgentTool {
  return tool(
    async ({ name, description, prompt, keywords, background }) => {
      useRecipesStore.getState().propose({ name, description, prompt, keywords, background })
      return '已记录提议，等待主人批准'
    },
    {
      name: 'propose_recipe',
      description: '把主人给出的可复用规则提议保存为配方。',
      schema: z.object({
        name: z.string().describe('配方名称'),
        description: z.string().describe('何时使用'),
        prompt: z.string().describe('角色应该怎么做'),
        keywords: z.array(z.string()).default([]).describe('方便指代的代码词'),
        background: z.boolean().default(false).describe('是否在后台执行'),
      }),
    },
  )
}

/** 让模型在对话中调整对主人的好感度。 */
function updateAffinityTool(characterId: string): AgentTool {
  return tool(
    async ({ delta, reason }) => {
      const next = useAffinityStore.getState().apply(characterId, delta)
      return `好感度已更新为 ${next}/100（${reason}）`
    },
    {
      name: 'update_affinity',
      description: '根据本轮对话给角色对主人的好感度加减分。只在关系明显升温或降温时调用。',
      schema: z.object({
        delta: z.number().min(-5).max(5).describe('好感度变化，单次 -5 到 +5'),
        reason: z.string().describe('变化原因，写入记录'),
      }),
    },
  )
}

/** 当前启用的内置工具。 */
export function builtinTools(characterId: string): AgentTool[] {
  const tools: AgentTool[] = [updateAffinityTool(characterId)]
  const search = useWebSearchStore.getState()
  if (search.enabled && search.apiKey.trim())
    tools.push(webSearchTool())

  const home = useHomeAssistantStore.getState()
  if (home.enabled && home.baseUrl.trim() && home.token.trim())
    tools.push(homeAssistantTool())

  if (useRecipesStore.getState().proposalsEnabled)
    tools.push(proposeRecipeTool())

  return tools
}

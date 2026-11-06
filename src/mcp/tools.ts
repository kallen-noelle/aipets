/**
 * MCP 工具桥：把远端工具注册成 LangChain 工具。
 *
 * 连接失败只记录日志并跳过该服务器，不影响对话本身。
 */

import { tool } from 'langchain'

import { enabledServers } from '@/config/domains/mcp'

import { McpClient, type McpToolDefinition } from './client'
import { jsonSchemaToZodObject } from './json-schema'

export type AgentTool = ReturnType<typeof tool>

function toLangChainTool(client: McpClient, definition: McpToolDefinition): AgentTool {
  return tool(
    async input => client.callTool(definition.name, input as Record<string, unknown>),
    {
      name: definition.name,
      description: definition.description ?? definition.name,
      schema: jsonSchemaToZodObject(definition.inputSchema),
    },
  )
}

/** 连接所有启用的服务器并收集工具。 */
export async function loadAgentTools(): Promise<AgentTool[]> {
  const servers = enabledServers()
  const tools: AgentTool[] = []

  for (const server of servers) {
    try {
      const client = new McpClient(server.url)
      await client.initialize()

      const definitions = await client.listTools()
      for (const definition of definitions)
        tools.push(toLangChainTool(client, definition))
    }
    catch (error) {
      console.warn(`[aipets] MCP 服务器 ${server.label} 连接失败`, error)
    }
  }

  return tools
}

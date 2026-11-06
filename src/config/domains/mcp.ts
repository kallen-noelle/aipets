/**
 * MCP 服务器域：远端工具服务的地址与开关。
 *
 * 只保存连接信息，连接状态不持久化。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const mcpServerSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, '请填写名称'),
  url: z.url('请填写合法的地址'),
  enabled: z.boolean(),
})

export type McpServer = z.infer<typeof mcpServerSchema>

interface McpState {
  servers: McpServer[]
  /** 桌面外壳启动本地服务器用的命令，网页版忽略。 */
  command: string
  /** 命令参数，空格分隔。 */
  args: string
  add: (server: Omit<McpServer, 'id'>) => void
  remove: (id: string) => void
  toggle: (id: string, enabled: boolean) => void
  updateLaunch: (patch: Partial<Pick<McpState, 'command' | 'args'>>) => void
}

export const useMcpStore = create<McpState>()(
  persist(
    set => ({
      servers: [],
      command: '',
      args: '',
      // 标识在 store 里生成，界面只提交业务字段。
      add: server => set(state => ({
        servers: [...state.servers, { ...server, id: `mcp-${Date.now()}` }],
      })),
      remove: id => set(state => ({
        servers: state.servers.filter(item => item.id !== id),
      })),
      toggle: (id, enabled) => set(state => ({
        servers: state.servers.map(item => item.id === id ? { ...item, enabled } : item),
      })),
      updateLaunch: patch => set(patch),
    }),
    persistOptions<McpState>('mcp'),
  ),
)

/** 当前启用的服务器。 */
export function enabledServers(): McpServer[] {
  return useMcpStore.getState().servers.filter(server => server.enabled)
}

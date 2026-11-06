/**
 * MCP 设置页。
 *
 * 管理远端工具服务器的地址与开关；启用后对话会自动带上它们的工具。
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { mcpServerSchema, useMcpStore, type McpServer } from '@/config/domains/mcp'
import { McpClient } from '@/mcp/client'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Label } from '@/ui/components/ui/label'
import { Switch } from '@/ui/components/ui/switch'

const EMPTY = { id: '', label: '', url: '', enabled: true }

export function McpPage() {
  const servers = useMcpStore(state => state.servers)
  const add = useMcpStore(state => state.add)
  const remove = useMcpStore(state => state.remove)
  const toggle = useMcpStore(state => state.toggle)
  const command = useMcpStore(state => state.command)
  const args = useMcpStore(state => state.args)
  const updateLaunch = useMcpStore(state => state.updateLaunch)

  const [testingId, setTestingId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  const form = useForm<McpServer>({
    resolver: zodResolver(mcpServerSchema),
    defaultValues: EMPTY,
  })

  const onSubmit = form.handleSubmit((values) => {
    add({ label: values.label, url: values.url, enabled: values.enabled })
    form.reset(EMPTY)
  })

  /** 连接服务器并列出工具，用来确认地址可用。 */
  const test = async (server: McpServer) => {
    setTestingId(server.id)
    setResults(current => ({ ...current, [server.id]: '连接中…' }))
    try {
      const client = new McpClient(server.url)
      await client.initialize()
      const tools = await client.listTools()
      setResults(current => ({ ...current, [server.id]: `连接成功，可用工具 ${tools.length} 个` }))
    }
    catch {
      setResults(current => ({ ...current, [server.id]: '连接失败，请检查地址与跨域设置' }))
    }
    finally {
      setTestingId(null)
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection
        title="添加 MCP 服务器"
        description="填写 HTTP 端点，启用后它的工具会加入对话。"
      >
        <div className="space-y-1.5">
          <Label htmlFor="label">名称</Label>
          <Input id="label" placeholder="例如：本地文件服务" {...form.register('label')} />
          {form.formState.errors.label
            ? <p className="text-xs text-destructive">{form.formState.errors.label.message}</p>
            : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="url">地址</Label>
          <Input id="url" placeholder="http://127.0.0.1:3000/mcp" {...form.register('url')} />
          {form.formState.errors.url
            ? <p className="text-xs text-destructive">{form.formState.errors.url.message}</p>
            : null}
        </div>

        <Button onClick={onSubmit}>添加</Button>
      </SettingSection>

      <SettingSection title={`已配置的服务器（${servers.length}）`}>
        {servers.length === 0
          ? <p className="text-sm text-muted-foreground">还没有配置服务器。</p>
          : servers.map(server => (
              <SettingRow key={server.id} label={server.label} description={server.url}>
                <div className="flex items-center justify-end gap-2">
                  {results[server.id]
                    ? <span className="text-xs text-muted-foreground">{results[server.id]}</span>
                    : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={testingId === server.id}
                    onClick={() => void test(server)}
                  >
                    {testingId === server.id ? '连接中…' : '测试连接'}
                  </Button>
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={enabled => toggle(server.id, enabled)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => remove(server.id)}>删除</Button>
                </div>
              </SettingRow>
            ))}
      </SettingSection>

      <SettingSection
        title="桌面启动命令"
        description="桌面外壳可以用这条命令启动本地服务器；网页版忽略。"
      >
        <div className="space-y-1.5">
          <Label htmlFor="mcp-command">服务器命令</Label>
          <Input
            id="mcp-command"
            placeholder="例如 npx，或本地可执行文件的路径"
            value={command}
            onChange={event => updateLaunch({ command: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mcp-args">参数</Label>
          <Input
            id="mcp-args"
            placeholder="空格分隔，例如 -y @modelcontextprotocol/server-filesystem"
            value={args}
            onChange={event => updateLaunch({ args: event.target.value })}
          />
        </div>
      </SettingSection>
    </div>
  )
}

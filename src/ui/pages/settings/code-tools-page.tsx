/**
 * 代码与工具模块页：说明这一类能力统一走 MCP，不在项目内硬编码。
 */

import { Link } from 'react-router'

import { SettingSection } from '@/ui/components/setting-section'

export function CodeToolsPage() {
  return (
    <div className="max-w-2xl">
      <SettingSection title="代码与工具" description="通过 MCP 服务器接入。">
        <p className="text-sm text-muted-foreground">
          文件读写、命令执行这类能力不写进业务代码，而是由外部 MCP server 提供。
          在 MCP 页添加服务器并启用后，它暴露的工具会自动进入模型的可用工具列表，
          调用结果显示在工具卡片里。
        </p>
        <Link to="/settings/modules/mcp" className="text-sm text-primary underline underline-offset-4">
          前往 MCP 设置
        </Link>
      </SettingSection>
    </div>
  )
}

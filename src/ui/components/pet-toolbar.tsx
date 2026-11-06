/**
 * 网页版的桌宠页工具条。
 *
 * 桌面版靠托盘与右键菜单进入聊天、设置；浏览器没有这些入口，所以页面
 * 右上角只保留设置导航。桌面桥存在时不渲染。
 */

import { Settings } from 'lucide-react'
import { Link } from 'react-router'

import { getDesktopBridge } from '@/desktop/bridge'

const buttonClass = 'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

export function PetToolbar() {
  if (getDesktopBridge())
    return null

  return (
    <nav className="fixed right-3 top-3 z-50 flex items-center gap-1 rounded-full border bg-background/80 p-1 shadow-sm backdrop-blur">
      <Link to="/settings" className={buttonClass}>
        <Settings className="size-3.5" />
        设置
      </Link>
    </nav>
  )
}

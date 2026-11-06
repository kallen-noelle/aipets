/**
 * 桌面版聊天窗口。
 *
 * 窗口无边框，不显示任何标题栏。顶部只保留一条 8px 的透明拖动区，
 * 保证窗口仍然可以移动；关闭由悬浮球再次点击或 Alt+F4 完成。
 */

import { ChatPanel } from '@/ui/components/chat-panel'

export function DesktopChatPage() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* 无边框窗口失去标题栏后无法拖动，这里留一条不可见的拖动区。 */}
      <div className="app-drag h-2 shrink-0" />
      <ChatPanel />
    </div>
  )
}

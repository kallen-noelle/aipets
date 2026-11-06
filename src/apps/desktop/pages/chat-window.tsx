/**
 * 桌面版聊天窗口。
 *
 * 独立窗口只放聊天面板，不再有网页版的会话侧栏和“返回舞台”入口。
 * 关闭窗口由悬浮球或窗口标题栏完成。
 */

import { ChatPanel } from '@/ui/components/chat-panel'

export function DesktopChatPage() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <ChatPanel />
    </div>
  )
}

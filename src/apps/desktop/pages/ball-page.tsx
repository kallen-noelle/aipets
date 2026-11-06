/**
 * 桌面版聊天悬浮球窗口。
 *
 * 独立的 64x64 透明置顶窗口：左键拖动由主进程移动窗口本身，
 * 位移不足 3px 视为点击，打开或收起聊天窗口。
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MessageCircle } from 'lucide-react'

import { getDesktopBridge } from '@/desktop/bridge'

const BALL_DRAG_THRESHOLD = 3

export function ChatBallPage() {
  const bridge = getDesktopBridge()
  const [chatOpen, setChatOpen] = useState(false)
  const dragRef = useRef<{ startX: number, startY: number, moved: boolean } | null>(null)

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('pet-surface')
    return () => root.classList.remove('pet-surface')
  }, [])

  useEffect(() => {
    if (!bridge)
      return

    let disposed = false
    const apply = (list: { kind: string, open: boolean }[]) => {
      if (!disposed)
        setChatOpen(list.some(item => item.kind === 'chat' && item.open))
    }
    void bridge.listWindows().then(apply)
    const off = bridge.onWindowsChanged(apply)
    return () => {
      disposed = true
      off()
    }
  }, [bridge])

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0)
      return

    dragRef.current = { startX: event.screenX, startY: event.screenY, moved: false }
    bridge?.beginBallDrag()

    // 窗口会被主进程跟着光标移动，监听挂在 window 上比按钮捕获更稳。
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  const onPointerMove = (event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag)
      return

    if (
      Math.abs(event.screenX - drag.startX) > BALL_DRAG_THRESHOLD
      || Math.abs(event.screenY - drag.startY) > BALL_DRAG_THRESHOLD
    ) {
      drag.moved = true
    }
  }

  const finishDrag = (toggle: boolean) => {
    const drag = dragRef.current
    if (!drag)
      return

    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    bridge?.endBallDrag()

    if (toggle && !drag.moved)
      void bridge?.toggleChatWindow()
  }

  const onPointerUp = () => finishDrag(true)
  const onPointerCancel = () => finishDrag(false)

  return (
    <div className="flex h-screen w-screen items-center justify-center p-1">
      <button
        type="button"
        aria-label={chatOpen ? '收起聊天' : '打开聊天'}
        aria-pressed={chatOpen}
        className={`flex size-14 touch-none select-none cursor-grab items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing ${
          chatOpen ? 'ring-2 ring-primary/40' : ''
        }`}
        onPointerDown={onPointerDown}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            void bridge?.toggleChatWindow()
          }
        }}
      >
        <MessageCircle className="size-6" />
      </button>
    </div>
  )
}

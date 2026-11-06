/**
 * 桌面版聊天悬浮球窗口。
 *
 * 独立的透明置顶小窗口：左键拖动由主进程移动窗口本身，位移不足 3px 视为
 * 点击，打开或收起聊天窗口。窗口比球体大一圈，留出阴影与放大动画的空间。
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MessageCircle } from 'lucide-react'

import { getDesktopBridge } from '@/desktop/bridge'

const BALL_DRAG_THRESHOLD = 3

export function ChatBallPage() {
  const bridge = getDesktopBridge()
  const [chatOpen, setChatOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number, startY: number, moved: boolean, started: boolean } | null>(null)

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('pet-surface')
    return () => root.classList.remove('pet-surface')
  }, [])

  useEffect(() => {
    if (!bridge)
      return

    let disposed = false
    const apply = (list: { kind: string, visible: boolean }[]) => {
      if (!disposed)
        setChatOpen(list.some(item => item.kind === 'chat' && item.visible))
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

    dragRef.current = { startX: event.screenX, startY: event.screenY, moved: false, started: false }

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

    // 判定为拖动后才让主进程跟随光标。点击时手抖 1～2px 不会带动窗口，
    // 否则球会先被推开一点再弹回来，看起来像“原地震动”。
    if (drag.moved && !drag.started) {
      drag.started = true
      setDragging(true)
      bridge?.beginBallDrag()
    }
  }

  const finishDrag = (toggle: boolean) => {
    const drag = dragRef.current
    if (!drag)
      return

    dragRef.current = null
    setDragging(false)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)

    if (drag.started)
      bridge?.endBallDrag()

    if (toggle && !drag.moved)
      void bridge?.toggleChatWindow()
  }

  const onPointerUp = () => finishDrag(true)
  const onPointerCancel = () => finishDrag(false)

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <button
        type="button"
        aria-label={chatOpen ? '收起聊天' : '打开聊天'}
        aria-pressed={chatOpen}
        className={`group relative flex size-10 touch-none select-none items-center justify-center rounded-full border border-border bg-card text-foreground  transition-transform duration-150 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 ${
          dragging ? 'scale-95 cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={onPointerDown}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            void bridge?.toggleChatWindow()
          }
        }}
      >
        <MessageCircle className="size-5 drop-shadow-sm" strokeWidth={2.2} />
        {chatOpen
          ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />
          : null}
      </button>
    </div>
  )
}

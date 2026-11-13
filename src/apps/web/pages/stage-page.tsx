/**
 * 舞台整页：顶栏、左侧角色与节拍工具条、右侧聊天面板。
 *
 * 布局对齐原工程：max-w-[1440px] 容器，聊天面板是圆角卡片。
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router'
import { MessageCircle } from 'lucide-react'

import { BeatDetector } from '@/audio/beat-detector'
import { useCharacterStore } from '@/config/domains/character'
import { CharacterStage } from '@/ui/components/character-stage'
import { ChatPanel } from '@/ui/components/chat-panel'
import { DebugMonitor } from '@/ui/components/debug-monitor'
import { useChatSnapshot } from '@/ui/hooks/use-chat-snapshot'

const chipClass = 'inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

const CHAT_BALL_KEY = 'aipets:chat-ball'
const CHAT_BALL_SIZE = 56
/** 悬浮球与浮层之间、以及距离视口边缘的间距。 */
const CHAT_BALL_GAP = 12
const CHAT_BALL_EDGE = 8

interface BallPosition {
  x: number
  y: number
}

function clampBallPosition(position: BallPosition, width: number, height: number): BallPosition {
  const maxX = Math.max(CHAT_BALL_EDGE, width - CHAT_BALL_SIZE - CHAT_BALL_EDGE)
  const maxY = Math.max(CHAT_BALL_EDGE, height - CHAT_BALL_SIZE - CHAT_BALL_EDGE)
  return {
    x: Math.min(Math.max(CHAT_BALL_EDGE, position.x), maxX),
    y: Math.min(Math.max(CHAT_BALL_EDGE, position.y), maxY),
  }
}

/** 首次位置在右下角；之后从本地记录恢复。 */
function loadBallPosition(): BallPosition {
  if (typeof window === 'undefined')
    return { x: 0, y: 0 }

  const fallback = {
    x: window.innerWidth - CHAT_BALL_SIZE - 24,
    y: window.innerHeight - CHAT_BALL_SIZE - 24,
  }

  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_BALL_KEY) ?? 'null') as BallPosition | null
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y))
      return clampBallPosition(saved, window.innerWidth, window.innerHeight)
  }
  catch {
    // 损坏的记录直接忽略，用默认位置。
  }

  return clampBallPosition(fallback, window.innerWidth, window.innerHeight)
}

/**
 * 聊天浮层的落点：依次尝试球的上、下、右、左，尽量不遮住球。
 * 上/下只钳制水平位置，左/右只钳制垂直位置；都放不下时贴边显示。
 */
function placeChatPanel(
  ball: BallPosition,
  viewport: { width: number, height: number },
  panelWidth: number,
  panelHeight: number,
): { left: number, top: number } {
  const right = ball.x + CHAT_BALL_SIZE
  const bottom = ball.y + CHAT_BALL_SIZE
  const maxLeft = Math.max(CHAT_BALL_EDGE, viewport.width - panelWidth - CHAT_BALL_EDGE)
  const maxTop = Math.max(CHAT_BALL_EDGE, viewport.height - panelHeight - CHAT_BALL_EDGE)
  const clampedLeft = Math.min(Math.max(CHAT_BALL_EDGE, right - panelWidth), maxLeft)
  const clampedTop = Math.min(
    Math.max(CHAT_BALL_EDGE, ball.y + (CHAT_BALL_SIZE - panelHeight) / 2),
    maxTop,
  )

  const above = { left: clampedLeft, top: ball.y - CHAT_BALL_GAP - panelHeight }
  if (above.top >= CHAT_BALL_EDGE)
    return above

  const below = { left: clampedLeft, top: bottom + CHAT_BALL_GAP }
  if (below.top <= maxTop)
    return below

  const toRight = { left: right + CHAT_BALL_GAP, top: clampedTop }
  if (toRight.left <= maxLeft)
    return toRight

  const toLeft = { left: ball.x - CHAT_BALL_GAP - panelWidth, top: clampedTop }
  if (toLeft.left >= CHAT_BALL_EDGE)
    return toLeft

  return { left: clampedLeft, top: Math.min(below.top, maxTop) }
}

export function StagePage() {
  const detectorRef = useRef<BeatDetector | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const chat = useChatSnapshot()
  const [ballPosition, setBallPosition] = useState<BallPosition>(loadBallPosition)
  const ballPositionRef = useRef(ballPosition)
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }))
  const [detecting, setDetecting] = useState(false)
  const [beats, setBeats] = useState(0)
  const [bpm, setBpm] = useState(0)
  const [beatError, setBeatError] = useState<string | null>(null)
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)

  const stopBeat = () => {
    detectorRef.current?.stop()
    detectorRef.current = null
    setDetecting(false)
  }

  const startBeat = async (file?: File) => {
    setBeatError(null)
    const detector = new BeatDetector()
    try {
      await detector.start({ onBeat: setBeats, onBpm: setBpm }, file)
      detectorRef.current = detector
      setDetecting(true)
    }
    catch {
      detector.stop()
      setBeatError(file ? '无法播放该音频文件' : '无法访问麦克风')
    }
  }

  useEffect(() => {
    return () => {
      detectorRef.current?.stop()
      detectorRef.current = null
    }
  }, [])

  // 窗口尺寸变化时把悬浮球拉回可视区域。
  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setBallPosition((current) => {
        const next = clampBallPosition(current, window.innerWidth, window.innerHeight)
        ballPositionRef.current = next
        return next
      })
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const moveBall = (next: BallPosition) => {
    ballPositionRef.current = next
    setBallPosition(next)
  }

  const onBallPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0)
      return

    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - ballPositionRef.current.x,
      offsetY: event.clientY - ballPositionRef.current.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onBallPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId)
      return

    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3)
      drag.moved = true
    if (!drag.moved)
      return

    moveBall(clampBallPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }, window.innerWidth, window.innerHeight))
  }

  const finishBallDrag = (event: ReactPointerEvent<HTMLButtonElement>, toggle: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId)
      return

    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)

    try {
      localStorage.setItem(CHAT_BALL_KEY, JSON.stringify(ballPositionRef.current))
    }
    catch {
      // 本地存储不可用时只丢失位置记忆，不影响使用。
    }

    if (toggle && !drag.moved)
      setChatOpen(open => !open)
  }

  const visibleInstances = instances.filter(item => item.enabled)
  const multiple = visibleInstances.length > 1

  const panelWidth = Math.min(420, Math.max(0, viewport.width - 32))
  const panelHeight = Math.min(Math.round(viewport.height * 0.7), 640)
  const panelPosition = placeChatPanel(ballPosition, viewport, panelWidth, panelHeight)

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8 lg:h-screen">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">aipets</p>
            <h1 className="text-2xl font-semibold">aipets Stage</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/settings" className={chipClass}>设置</Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4">
            <div className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-4">
              {visibleInstances.map(instance => (
                <div
                  key={instance.id}
                  className={multiple
                    ? 'h-[30vh] w-[min(45%,240px)]'
                    : 'h-[56vh] w-[min(100%,420px)]'}
                >
                  <CharacterStage
                    characterId={instance.characterId}
                    appearance={instance.appearance}
                    instanceId={instance.id}
                    interactive={instance.id === activeInstanceId}
                  />
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              点击角色切换对话对象，聊天顶部可切换实例。
              {visibleInstances.length === 0 ? '还没有启用的角色，去模型页添加实例。' : ''}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-[0.2em]">节拍同步</span>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file)
                    return
                  if (detecting)
                    stopBeat()
                  void startBeat(file)
                }}
              />

              <button
                type="button"
                className={chipClass}
                disabled={detecting}
                onClick={() => void startBeat()}
              >
                麦克风
              </button>

              <button
                type="button"
                className={chipClass}
                onClick={() => fileInputRef.current?.click()}
              >
                音频文件
              </button>

              {detecting
                ? <button type="button" className={chipClass} onClick={stopBeat}>停止</button>
                : null}

              <span>
                {beats}
                {' '}
                拍 ·
                {' '}
                {bpm}
                {' '}
                BPM
              </span>
            </div>

            {beatError ? <p className="text-xs text-destructive">{beatError}</p> : null}
          </main>
        </div>
      </div>

      {/* 聊天浮层跟着悬浮球展开；悬浮球始终可见，可拖动。 */}
      {chatOpen
        ? (
            <div
              className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
              style={{
                left: panelPosition.left,
                top: panelPosition.top,
                width: panelWidth,
                height: panelHeight,
              }}
            >
              <ChatPanel onClose={() => setChatOpen(false)} />
            </div>
          )
        : null}

      <button
        type="button"
        aria-label={chatOpen ? '收起聊天' : '打开聊天'}
        aria-pressed={chatOpen}
        style={{ left: ballPosition.x, top: ballPosition.y }}
        className={`fixed z-50 flex size-14 touch-none select-none cursor-grab items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing ${
          chatOpen ? 'ring-2 ring-primary/40' : ''
        }`}
        onPointerDown={onBallPointerDown}
        onPointerMove={onBallPointerMove}
        onPointerUp={event => finishBallDrag(event, true)}
        onPointerCancel={event => finishBallDrag(event, false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setChatOpen(open => !open)
          }
        }}
      >
        <MessageCircle className="size-6" />
        {chat.busy
          ? <span className="pointer-events-none absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-destructive" />
          : null}
      </button>

      {/* 每个实例一个独立监控面板，多实例互不覆盖。 */}
      {visibleInstances.length > 0
        ? (
            <div className="pointer-events-auto fixed bottom-2 left-2 z-50 flex max-w-[calc(100vw-1rem)] items-end gap-2 overflow-x-auto">
              {visibleInstances.map(instance => (
                <DebugMonitor key={instance.id} instanceId={instance.id} />
              ))}
            </div>
          )
        : null}
    </div>
  )
}

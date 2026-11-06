/**
 * 消息列表：flex-col 里用 self-end/self-start 对齐气泡，
 * 与原工程保持一致。
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'

import type { ChatMessage } from '@/config/domains/sessions'
import { useToolCardsStore } from '@/config/domains/tool-cards'
import { Button } from '@/ui/components/ui/button'

/** 等待首个 token 时的三点跳动指示。 */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5">
      {[0, 1, 2].map(index => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70"
          style={{ animationDelay: `${index * 0.15}s` }}
        />
      ))}
    </span>
  )
}

/** 单条消息：助手消息悬停时出现复制按钮。 */
function MessageBubble(props: { message: ChatMessage, showTools: boolean }) {
  const [copied, setCopied] = useState(false)
  const isUser = props.message.role === 'user'
  const hasText = props.message.content.length > 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
    catch {
      // 剪贴板不可用时静默忽略。
    }
  }

  return (
    <div
      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
        isUser
          ? 'self-end bg-primary text-primary-foreground'
          : 'self-start bg-card text-foreground'
      }`}
    >
      {props.message.imageUrl
        ? <img src={props.message.imageUrl} alt="消息图片" className="mb-2 max-h-60 rounded-lg" />
        : null}
      {props.message.content}

      {props.showTools && props.message.tools?.length
        ? (
            <div className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
              {props.message.tools.map(name => (
                <span key={name}>工具：{name}</span>
              ))}
            </div>
          )
        : null}

      {!isUser && hasText
        ? (
            <span className="ml-1 inline-flex">
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => void copy()}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </span>
          )
        : null}
    </div>
  )
}

export function ChatMessageList(props: {
  messages: ChatMessage[]
  streaming: string
  /** 流式过程中正在调用的工具名，可选。 */
  activeTool?: string | null
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const showTools = useToolCardsStore(state => state.enabled && state.replyCards)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [props.messages.length, props.streaming])

  const empty = props.messages.length === 0 && !props.streaming

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
      {empty
        ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">和她聊点什么吧。</p>
            </div>
          )
        : null}

      {props.messages.map(message => (
        <MessageBubble key={message.id} message={message} showTools={showTools} />
      ))}

      {props.streaming
        ? (
            <div className="max-w-[85%] self-start whitespace-pre-wrap rounded-2xl bg-card px-4 py-2 text-sm">
              {props.streaming
                ? (
                    <>
                      {props.streaming}
                      <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-foreground/60 align-middle" />
                    </>
                  )
                : props.activeTool
                  ? `正在调用 ${props.activeTool}…`
                  : <TypingDots />}
            </div>
          )
        : null}

      <div ref={bottomRef} />
    </main>
  )
}

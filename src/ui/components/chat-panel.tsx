/**
 * 聊天主面板。
 *
 * 结构对齐原工程：
 *   header（会话/提供商/模型/朗读）
 *   main   max-w-3xl flex-1 min-h-0 消息区
 *   footer max-w-3xl flex-shrink-0 快捷工具行 + 单行输入
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Image as ImageIcon, Mic, MicOff, RefreshCw, Send, StopCircle, Trash2, Wand2, X } from 'lucide-react'

import { loadCharactersCatalog } from '@/character/catalog'
import type { CharacterDefinition } from '@/character/types'
import { useCharacterStore } from '@/config/domains/character'
import { useModelsStore } from '@/config/domains/models'
import { useProvidersStore } from '@/config/domains/providers'
import { useSessionsStore } from '@/config/domains/sessions'
import { useSpeechStore } from '@/config/domains/speech'
import { useStickersStore } from '@/config/domains/stickers'
import { getDesktopBridge } from '@/desktop/bridge'
import { generateImage } from '@/image/generate'
import { chatController } from '@/llm/chat-controller'
import { VoiceInput } from '@/speech/voice-input'
import { ChatMessageList } from '@/ui/components/chat-message-list'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/ui/select'
import { useChatSnapshot } from '@/ui/hooks/use-chat-snapshot'

export interface ChatPanelProps {
  /** 网页版回到桌宠页的入口；不传则不显示。 */
  onBackToPet?: () => void
  /** 悬浮窗模式下的收起按钮；不传则不显示。 */
  onClose?: () => void
}

const toolBtnClass = 'inline-flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40'

export function ChatPanel({ onBackToPet, onClose }: ChatPanelProps) {
  const sessions = useSessionsStore(state => state.sessions)
  const activeId = useSessionsStore(state => state.activeId)
  const createSession = useSessionsStore(state => state.createSession)
  const setActiveSession = useSessionsStore(state => state.setActive)
  const clearMessages = useSessionsStore(state => state.clearMessages)
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const setActiveInstance = useCharacterStore(state => state.setActiveInstance)
  const model = useModelsStore(state => state.selected)
  const selectModel = useModelsStore(state => state.select)
  const providers = useProvidersStore(state => state.items)
    .filter(item => item.capabilities.includes('chat'))
  const activeProviderId = useProvidersStore(state => state.activeId)
  const setActiveProvider = useProvidersStore(state => state.setActive)
  const ttsEnabled = useSpeechStore(state => state.ttsEnabled)
  const updateSpeech = useSpeechStore(state => state.update)
  const stickers = useStickersStore(state => state.items)
  const snapshot = useChatSnapshot()
  const navigate = useNavigate()
  const bridge = getDesktopBridge()

  const [recording, setRecording] = useState(false)
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false)
  const [characters, setCharacters] = useState<CharacterDefinition[]>([])
  const voiceInputRef = useRef<VoiceInput | null>(null)

  useEffect(() => {
    let disposed = false
    void loadCharactersCatalog().then((catalog) => {
      if (!disposed)
        setCharacters(catalog.characters)
    })

    return () => {
      disposed = true
    }
  }, [])

  const instance = instances.find(item => item.id === activeInstanceId) ?? instances[0]
  const instanceId = instance?.id ?? ''
  // 实例选择器显示序号与角色名，避免只看到资源标识。
  const instanceLabel = (characterId: string, index: number): string => {
    const name = characters.find(item => item.id === characterId)?.name ?? characterId
    return `实例 ${index + 1} · ${name}`
  }
  // 会话按实例隔离，切换实例后只看当前实例的会话。
  const scopedSessions = sessions.filter(session => session.instanceId === instanceId)
  const active = scopedSessions.find(session => session.id === activeId) ?? scopedSessions[0]
  const provider = providers.find(item => item.id === activeProviderId) ?? providers[0]
  const ready = Boolean(provider?.apiKey) && Boolean(model)

  const openSettings = () => {
    if (bridge) {
      void bridge.openWindow('settings', '/settings/providers')
      return
    }
    navigate('/settings/providers')
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || snapshot.busy)
      return

    setInput('')
    setMessage(null)
    await chatController.send(text)
  }

  const toggleVoice = async () => {
    setMessage(null)

    if (recording) {
      const current = voiceInputRef.current
      voiceInputRef.current = null
      setRecording(false)
      if (!current)
        return

      try {
        const text = await current.stop()
        if (text)
          await chatController.send(text)
      }
      catch {
        setMessage('语音识别失败')
      }
      return
    }

    try {
      const newInput = new VoiceInput()
      await newInput.start()
      voiceInputRef.current = newInput
      setRecording(true)
    }
    catch {
      setMessage('无法访问麦克风')
    }
  }

  const drawImage = async () => {
    if (!active)
      return
    const lastUser = active.messages.filter(item => item.role === 'user').at(-1)
    if (!lastUser?.content) {
      setMessage('先发一条描述，再点画图')
      return
    }

    setGenerating(true)
    setMessage(null)
    try {
      const url = await generateImage(lastUser.content)
      const sessionId = active.id
      useSessionsStore.getState().appendMessage(sessionId, { role: 'assistant', content: '', imageUrl: url })
    }
    catch {
      setMessage('画图失败，请检查提供商是否支持图像接口')
    }
    finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (instanceId && scopedSessions.length === 0)
      createSession(instanceId)
  }, [instanceId, scopedSessions.length, createSession])

  useEffect(() => () => {
    voiceInputRef.current?.cancel()
    voiceInputRef.current = null
  }, [])

  return (
    <div className="flex min-w-0 flex-1 min-h-0 flex-col">
      {ready
        ? null
        : (
            <div className="flex items-center justify-between gap-4 border-b bg-muted/50 px-4 py-2">
              <span className="text-xs text-muted-foreground">还没配置提供商或模型，先去设置里补上。</span>
              <Button size="sm" variant="outline" onClick={openSettings}>打开设置</Button>
            </div>
          )}

      {/* 顶部栏：会话与模型快捷选择。 */}
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        {/* 多个实例时可以切换对话对象，会话与角色卡随实例切换。 */}
        {instances.length > 1
          ? (
              <Select value={activeInstanceId} onValueChange={setActiveInstance}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="对话实例" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((item, index) => (
                    <SelectItem key={item.id} value={item.id}>
                      {instanceLabel(item.characterId, index)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          : null}

        <Select value={active?.id ?? ''} onValueChange={setActiveSession}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="会话" />
          </SelectTrigger>
          <SelectContent>
            {scopedSessions.map(session => (
              <SelectItem key={session.id} value={session.id}>{session.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          aria-label="新建聊天"
          disabled={!instanceId}
          onClick={() => createSession(instanceId)}
        >
          +
        </Button>

        <Select value={activeProviderId ?? ''} onValueChange={setActiveProvider}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="提供商" />
          </SelectTrigger>
          <SelectContent>
            {providers.map(item => (
              <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="h-8 w-32 text-xs"
          value={model ?? ''}
          placeholder="gpt-4o-mini"
          onChange={event => selectModel(event.target.value)}
        />

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={event => updateSpeech({ ttsEnabled: event.target.checked })}
            />
            朗读回复
          </label>

          {onClose
            ? (
                <button
                  type="button"
                  aria-label="收起聊天"
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={onClose}
                >
                  <X className="size-4" />
                </button>
              )
            : null}
        </div>
      </header>

      <ChatMessageList
        messages={active?.messages ?? []}
        streaming={snapshot.streaming}
      />

      {/* 底部快捷工具行 + 输入区，独立于消息区保证贴底。 */}
      <footer className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={toolBtnClass}
            disabled={!ready || snapshot.busy}
            onClick={() => void toggleVoice()}
          >
            {recording
              ? <><MicOff className="h-3.5 w-3.5" /> 停止</>
              : <><Mic className="h-3.5 w-3.5" /> 语音</>}
          </button>

          <button
            type="button"
            className={toolBtnClass}
            disabled={!ready || snapshot.busy}
            onClick={() => setStickerPickerOpen(value => !value)}
          >
            <ImageIcon className="h-3.5 w-3.5" /> 贴纸
          </button>

          <button
            type="button"
            className={toolBtnClass}
            disabled={!ready || snapshot.busy || generating}
            onClick={() => void drawImage()}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {generating ? '画图中…' : '画一张'}
          </button>

          {snapshot.busy
            ? (
                <button type="button" className={toolBtnClass} onClick={() => chatController.stop()}>
                  <StopCircle className="h-3.5 w-3.5" /> 停止
                </button>
              )
            : (
                <button
                  type="button"
                  className={toolBtnClass}
                  disabled={!ready || (active?.messages.length ?? 0) === 0}
                  onClick={() => void chatController.regenerate()}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 重新生成
                </button>
              )}

          <button
            type="button"
            className={toolBtnClass}
            disabled={!active || active.messages.length === 0}
            onClick={() => {
              if (window.confirm('清空当前会话的全部消息吗？'))
                clearMessages(active.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> 清空
          </button>

          {onBackToPet
            ? (
                <button type="button" className={`${toolBtnClass} ml-auto`} onClick={onBackToPet}>
                  桌宠
                </button>
              )
            : null}
        </div>

        {stickerPickerOpen && stickers.length > 0
          ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2">
                {stickers.map(sticker => (
                  <button
                    key={sticker.id}
                    type="button"
                    className="h-14 w-14 overflow-hidden rounded-lg border transition hover:bg-accent"
                    onClick={() => {
                      void chatController.send('', sticker.url)
                      setStickerPickerOpen(false)
                    }}
                  >
                    {sticker.url
                      ? <img src={sticker.url} alt={sticker.name} className="h-full w-full object-contain" />
                      : sticker.name}
                  </button>
                ))}
              </div>
            )
          : null}

        <div className="flex gap-2">
          <Input
            className="flex-1"
            value={input}
            disabled={!ready || snapshot.busy}
            placeholder="输入消息，回车发送"
            onChange={event => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage()
              }
            }}
          />
          <button
            type="button"
            disabled={!ready || snapshot.busy || !input.trim()}
            onClick={() => void sendMessage()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> 发送
          </button>
        </div>
      </footer>

      {snapshot.error ? <p className="px-4 pb-2 text-xs text-destructive">{snapshot.error}</p> : null}
      {message ? <p className="px-4 pb-2 text-xs text-destructive">{message}</p> : null}
    </div>
  )
}

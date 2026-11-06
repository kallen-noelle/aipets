/**
 * 对话控制器：串联会话、Agent 流式输出与错误处理。
 *
 * 界面只订阅快照并调用 `send` / `stop`，不参与任何对话流程决策。
 */

import { getCharacter, loadCharactersCatalog } from '@/character/catalog'
import type { CharacterDefinition } from '@/character/types'
import { cardOverride } from '@/config/domains/card'
import { activeInstance } from '@/config/domains/character'
import { useMemoryStore } from '@/config/domains/memory'
import {
  activeSessionFor,
  ensureSession,
  useSessionsStore,
} from '@/config/domains/sessions'
import { useSpeechStore } from '@/config/domains/speech'
import { pickSticker, stickerSource } from '@/config/domains/stickers'
import { recordDebugEvent } from '@/debug/monitor'
import { emitPetEvent } from '@/desktop/pet-events'
import { extractAndRemember } from '@/memory/extractor'
import { speak } from '@/speech/tts'

import { streamChat } from './chat-service'
import { requestPerformancePlan } from './director-service'

export interface ChatSnapshot {
  streaming: string
  busy: boolean
  error: string | null
}

const EMPTY: ChatSnapshot = { streaming: '', busy: false, error: null }

export class ChatController {
  private snapshotValue: ChatSnapshot = EMPTY
  private readonly listeners = new Set<(snapshot: ChatSnapshot) => void>()
  private controller: AbortController | null = null
  private stopSpeaking: (() => void) | null = null
  private character: CharacterDefinition | null = null
  /** 缓存键为实例与角色的组合，实例换角色后强制重读。 */
  private characterKey: string | null = null
  private characterPromise: Promise<CharacterDefinition> | null = null

  subscribe(listener: (snapshot: ChatSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): ChatSnapshot {
    return this.snapshotValue
  }

  async send(input: string, imageUrl?: string): Promise<void> {
    const text = input.trim()
    if ((!text && !imageUrl) || this.snapshotValue.busy)
      return

    const instance = activeInstance()
    if (!instance) {
      this.update({ streaming: '', busy: false, error: '没有可用的角色实例' })
      return
    }

    const sessionId = ensureSession(instance.id)
    // 新回合立即取消上一轮表演与环境编排。
    emitPetEvent({ kind: 'turn-started', instanceId: instance.id })
    useSessionsStore.getState().appendMessage(sessionId, {
      role: 'user',
      content: text,
      ...(imageUrl ? { imageUrl } : {}),
    })

    this.update({ streaming: '', busy: true, error: null })
    this.controller = new AbortController()

    const session = activeSessionFor(instance.id)
    // 刚追加的当前输入要去掉，streamChat 会单独传入。
    const previous = session?.messages.slice(0, -1) ?? []
    const memory = useMemoryStore.getState()
    // 角色卡设定的轮数优先，没有设置时用短期记忆窗口。
    // 一轮是一问一答，折算成两条消息。
    const override = cardOverride(instance.characterId, instance.id)
    const historyWindowMsgs = override.historyWindow
      ? override.historyWindow * 2
      : memory.shortTermWindow
    const history = memory.shortTermEnabled
      ? previous.slice(-historyWindowMsgs)
      : []

    let tools: string[] = []
    try {
      const character = await this.loadCharacter(instance.id, instance.characterId)
      await streamChat({
        character,
        instanceId: instance.id,
        history,
        input: text,
        imageUrl,
        signal: this.controller.signal,
        handlers: {
          onToken: (token) => {
            this.patch({ streaming: this.snapshotValue.streaming + token })
          },
          onTools: (names) => {
            tools = names
          },
          onDone: (full) => {
            recordDebugEvent('chat', 'done', `回复 ${full.length} 字`)
            useSessionsStore.getState().appendMessage(sessionId, {
              role: 'assistant',
              content: full,
              ...(tools.length > 0 ? { tools } : {}),
            })
            this.update({ streaming: '', busy: false, error: null })

            const sticker = pickSticker()
            if (sticker)
              useSessionsStore.getState().appendMessage(sessionId, { role: 'assistant', content: '', imageUrl: stickerSource(sticker) })

            // 记忆提取在后台进行，失败不影响这轮对话。
            if (text && useMemoryStore.getState().longTermEnabled) {
              void extractAndRemember(text, full, instance.id).catch((error) => {
                console.warn('[aipets] 记忆提取失败', error)
              })
            }

            // 导演与语音并行，失败时规则导演继续。
            void requestPerformancePlan({
              character,
              instanceId: instance.id,
              userText: text,
              replyText: full,
            }).then((steps) => {
              if (steps?.length)
                emitPetEvent({ kind: 'perform', instanceId: instance.id, steps })
            })

            const speaking = this.speakIfEnabled(full)
            if (speaking) {
              void speaking.finally(() => {
                emitPetEvent({ kind: 'reply-ended', instanceId: instance.id })
              })
            }
            else {
              emitPetEvent({ kind: 'reply-ended', instanceId: instance.id })
            }
          },
          onError: (message) => {
            recordDebugEvent('chat', 'error', message)
            this.update({ streaming: '', busy: false, error: message })
          },
        },
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '对话失败'
      this.update({ streaming: '', busy: false, error: message })
    }
    finally {
      this.controller = null
    }
  }

  /** 中断当前回答，已产出的文字不写入会话。 */
  stop(): void {
    this.controller?.abort()
    this.controller = null
    this.stopSpeaking?.()
    this.stopSpeaking = null
    emitPetEvent({ kind: 'speech-ended' })
    this.update({ streaming: '', busy: false, error: null })
  }

  /** 从最后一条用户消息开始重新生成：先截断会话，再发那条消息。 */
  async regenerate(): Promise<void> {
    if (this.snapshotValue.busy)
      return

    const instance = activeInstance()
    const session = instance ? activeSessionFor(instance.id) : null
    if (!session || session.messages.length === 0)
      return

    const lastUser = [...session.messages].reverse().find(msg => msg.role === 'user')
    if (!lastUser)
      return

    const sessionId = session.id
    useSessionsStore.getState().truncateBeforeLastUser(sessionId)
    await this.send(lastUser.content, lastUser.imageUrl)
  }

  /** 按配置朗读回复，同时通知桌宠进入说话状态。返回朗读完成的 promise。 */
  private speakIfEnabled(text: string): Promise<void> | null {
    const config = useSpeechStore.getState()
    if (!config.ttsEnabled || !config.autoSpeak || !text)
      return null

    emitPetEvent({ kind: 'speech-started' })

    return speak(text)
      .then((stop) => {
        this.stopSpeaking = stop
      })
      .catch((error) => {
        console.warn('[aipets] 朗读失败', error)
      })
      .finally(() => {
        this.stopSpeaking = null
        emitPetEvent({ kind: 'speech-ended' })
      })
  }

  /** 当前实例对应的角色。实例换角色后缓存失效，下一轮对话读新角色的资源与人设。 */
  private async loadCharacter(instanceId: string, characterId: string): Promise<CharacterDefinition> {
    const key = `${instanceId}:${characterId}`
    if (this.character && this.characterKey === key)
      return this.character

    if (!this.characterPromise) {
      this.characterPromise = loadCharactersCatalog()
        .then(catalog => getCharacter(catalog, characterId))
        .then((character) => {
          this.character = character
          this.characterKey = key
          return character
        })
        .finally(() => {
          this.characterPromise = null
        })
    }

    return this.characterPromise
  }

  private update(next: ChatSnapshot): void {
    this.snapshotValue = next
    for (const listener of this.listeners)
      listener(next)
  }

  private patch(patch: Partial<ChatSnapshot>): void {
    this.update({ ...this.snapshotValue, ...patch })
  }
}

/** 全局唯一控制器，聊天窗口只有一个。 */
export const chatController = new ChatController()

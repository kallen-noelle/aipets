/**
 * 会话域：会话列表与消息。
 *
 * 只存纯文字消息；流式过程中的临时文本由界面自己持有，结束后再写入这里，
 * 避免每个 token 触发一次持久化。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'
import { useCharacterStore } from './character'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  /** 图片消息用 data URL 或远程地址。 */
  imageUrl?: string
  /** 本轮调用到的工具名。 */
  tools?: string[]
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
  /** 会话所属的角色实例，不同实例的会话互不串扰。 */
  instanceId: string
}

interface SessionsState {
  sessions: ChatSession[]
  activeId: string | null
  createSession: (instanceId: string) => string
  removeSession: (id: string) => void
  setActive: (id: string) => void
  appendMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'createdAt'>) => void
  setTitle: (sessionId: string, title: string) => void
  /** 用导入的数据整体替换会话列表。 */
  replaceSessions: (sessions: ChatSession[]) => void
  /** 清空全部会话。 */
  clearSessions: () => void
  /** 清空单个会话的消息列表，保留会话本身。 */
  clearMessages: (sessionId: string) => void
  /** 删除某个实例的全部会话。 */
  clearInstanceSessions: (instanceId: string) => void
  /** 截断到最后一条用户消息之前，之后的消息全部丢弃。 */
  truncateBeforeLastUser: (sessionId: string) => void
}

function now(): number {
  return Date.now()
}

/** 旧数据里可能有同一毫秒创建的重复会话，合并时按标识去重。 */
function mergeStored(persisted: unknown, current: SessionsState): SessionsState {
  const saved = (persisted ?? {}) as Partial<SessionsState>
  const byId = new Map<string, ChatSession>()
  const fallbackInstance = useCharacterStore.getState().instances[0]?.id ?? 'instance-main'

  for (const session of saved.sessions ?? current.sessions) {
    const normalized: ChatSession = {
      ...session,
      // 旧会话没有实例归属，统一挂到第一个实例。
      instanceId: session.instanceId || fallbackInstance,
    }
    const kept = byId.get(normalized.id)
    if (!kept || normalized.messages.length > kept.messages.length)
      byId.set(normalized.id, normalized)
  }

  const sessions = [...byId.values()]
  const activeId = saved.activeId && byId.has(saved.activeId)
    ? saved.activeId
    : sessions[0]?.id ?? null

  return { ...current, ...saved, sessions, activeId }
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set) => ({
      sessions: [],
      activeId: null,

      createSession: (instanceId) => {
        // 同一毫秒内连续创建时会撞号，要加随机后缀。
        const id = `session-${now()}-${Math.random().toString(36).slice(2, 8)}`
        const session: ChatSession = {
          id,
          title: '新对话',
          messages: [],
          updatedAt: now(),
          instanceId,
        }
        set(state => ({ sessions: [session, ...state.sessions], activeId: id }))
        return id
      },

      removeSession: id => set(state => ({
        sessions: state.sessions.filter(item => item.id !== id),
        activeId: state.activeId === id ? null : state.activeId,
      })),

      setActive: id => set({ activeId: id }),

      appendMessage: (sessionId, message) => {
        const entry: ChatMessage = { ...message, id: `msg-${now()}-${Math.random()}`, createdAt: now() }
        set(state => ({
          sessions: state.sessions.map(item => item.id === sessionId
            ? {
                ...item,
                messages: [...item.messages, entry],
                updatedAt: now(),
                // 第一条用户消息作为标题。
                title: item.messages.length === 0 && message.role === 'user'
                  ? message.content.slice(0, 20)
                  : item.title,
              }
            : item),
        }))
      },

      setTitle: (sessionId, title) => set(state => ({
        sessions: state.sessions.map(item => item.id === sessionId ? { ...item, title } : item),
      })),

      replaceSessions: (sessions) => {
        // 导入的数据可能来自旧版本，没有实例归属时挂到第一个实例。
        const fallback = useCharacterStore.getState().instances[0]?.id ?? 'instance-main'
        const normalized = sessions.map(item => ({
          ...item,
          instanceId: item.instanceId || fallback,
        }))
        set({ sessions: normalized, activeId: normalized[0]?.id ?? null })
      },

      clearSessions: () => set({ sessions: [], activeId: null }),

      clearMessages: sessionId => set(state => ({
        sessions: state.sessions.map(item => item.id === sessionId
          ? { ...item, messages: [], updatedAt: now() }
          : item),
      })),

      clearInstanceSessions: instanceId => set((state) => {
        const sessions = state.sessions.filter(item => item.instanceId !== instanceId)
        const activeId = state.activeId && sessions.some(item => item.id === state.activeId)
          ? state.activeId
          : sessions[0]?.id ?? null
        return { sessions, activeId }
      }),

      truncateBeforeLastUser: sessionId => set(state => ({
        sessions: state.sessions.map((item) => {
          if (item.id !== sessionId)
            return item

          const lastUserIndex = [...item.messages].reverse().findIndex(msg => msg.role === 'user')
          if (lastUserIndex === -1)
            return item

          const realIndex = item.messages.length - 1 - lastUserIndex
          return { ...item, messages: item.messages.slice(0, realIndex), updatedAt: now() }
        }),
      })),
    }),
    persistOptions<SessionsState>('sessions', 1, mergeStored),
  ),
)

/** 当前活动会话，没有时返回 null。 */
export function activeSession(): ChatSession | null {
  const { sessions, activeId } = useSessionsStore.getState()
  return sessions.find(item => item.id === activeId) ?? null
}

/** 某个实例的活动会话；活动会话不属于该实例时退回该实例的最新会话。 */
export function activeSessionFor(instanceId: string): ChatSession | null {
  const active = activeSession()
  if (active?.instanceId === instanceId)
    return active

  return useSessionsStore.getState().sessions.find(item => item.instanceId === instanceId) ?? null
}

/** 保证某个实例存在活动会话，返回它的标识。 */
export function ensureSession(instanceId: string): string {
  const state = useSessionsStore.getState()
  const active = state.sessions.find(item => item.id === state.activeId)
  if (active?.instanceId === instanceId)
    return active.id

  const existing = state.sessions.find(item => item.instanceId === instanceId)
  if (existing) {
    state.setActive(existing.id)
    return existing.id
  }

  return state.createSession(instanceId)
}

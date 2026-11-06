/**
 * 网页版聊天页。
 *
 * 左侧返回/新建/会话列表，右侧聊天面板。桌面版的聊天窗口不使用这个页面。
 */

import { Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { useCharacterStore } from '@/config/domains/character'
import { useSessionsStore } from '@/config/domains/sessions'
import { Button } from '@/ui/components/ui/button'

import { ChatPanel } from '@/ui/components/chat-panel'

export function WebChatPage() {
  const sessions = useSessionsStore(state => state.sessions)
  const activeId = useSessionsStore(state => state.activeId)
  const createSession = useSessionsStore(state => state.createSession)
  const setActive = useSessionsStore(state => state.setActive)
  const removeSession = useSessionsStore(state => state.removeSession)
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const navigate = useNavigate()

  const instanceId = (instances.find(item => item.id === activeInstanceId) ?? instances[0])?.id ?? ''
  // 聊天窗口的会话列表只显示当前实例的会话。
  const scopedSessions = sessions.filter(session => session.instanceId === instanceId)

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col gap-2 border-r p-3 sm:flex">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回舞台
        </Link>

        <Button
          className="mt-2"
          disabled={!instanceId}
          onClick={() => createSession(instanceId)}
        >
          新建聊天
        </Button>

        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {scopedSessions.map(session => (
            <div
              key={session.id}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                session.id === activeId
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => setActive(session.id)}
              >
                {session.title}
              </button>

              <button
                type="button"
                aria-label="删除会话"
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() => {
                  if (window.confirm(`删除会话「${session.title}」吗？`))
                    removeSession(session.id)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <ChatPanel onBackToPet={() => navigate('/')} />
    </div>
  )
}

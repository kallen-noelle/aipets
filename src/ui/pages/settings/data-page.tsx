/**
 * 数据设置页：导入、导出与重置。
 */

import { useState } from 'react'

import {
  clearAllData,
  clearSessions,
  exportSessions,
  importSessions,
  resetProviders,
} from '@/config/data-transfer'
import { useCharacterStore } from '@/config/domains/character'
import { useSessionsStore } from '@/config/domains/sessions'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function DataPage() {
  const [message, setMessage] = useState<string | null>(null)
  const instances = useCharacterStore(state => state.instances)
  const sessions = useSessionsStore(state => state.sessions)
  const clearInstanceSessions = useSessionsStore(state => state.clearInstanceSessions)

  const importFile = async (file: File) => {
    try {
      importSessions(await file.text())
      setMessage('聊天记录已导入')
    }
    catch {
      setMessage('导入失败，请检查文件格式')
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="聊天记录" description="导出后可以在其他浏览器恢复。">
        <SettingRow label="导出">
          <Button
            variant="outline"
            onClick={() => download('aipets-chats.json', exportSessions())}
          >
            导出聊天 JSON
          </Button>
        </SettingRow>

        <SettingRow label="导入" description="会替换当前全部会话">
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file)
                void importFile(file)
            }}
          />
        </SettingRow>

        <SettingRow label="删除聊天" description="不可恢复">
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm('确定删除全部聊天记录吗？')) {
                clearSessions()
                setMessage('聊天记录已删除')
              }
            }}
          >
            删除全部聊天
          </Button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="按角色清理" description="只删除指定实例的会话，实例与角色卡保留。">
        {instances.map((instance, index) => {
          const count = sessions.filter(item => item.instanceId === instance.id).length
          return (
            <SettingRow
              key={instance.id}
              label={`实例 ${index + 1} · ${instance.characterId}`}
              description={`${count} 条会话`}
            >
              <Button
                variant="outline"
                disabled={count === 0}
                onClick={() => {
                  if (window.confirm('删除这个角色的全部聊天记录吗？')) {
                    clearInstanceSessions(instance.id)
                    setMessage('该角色的聊天记录已删除')
                  }
                }}
              >
                删除该角色聊天
              </Button>
            </SettingRow>
          )
        })}
      </SettingSection>

      <SettingSection title="重置" description="恢复默认配置。">
        <SettingRow label="提供商">
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm('恢复默认提供商配置吗？')) {
                resetProviders()
                setMessage('提供商已恢复默认')
              }
            }}
          >
            恢复默认
          </Button>
        </SettingRow>

        <SettingRow label="全部数据" description="所有以 aipets: 开头的配置都会删除">
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm('清空全部本地数据并重新加载吗？')) {
                clearAllData()
                window.location.reload()
              }
            }}
          >
            清空全部数据
          </Button>
        </SettingRow>

        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </SettingSection>
    </div>
  )
}

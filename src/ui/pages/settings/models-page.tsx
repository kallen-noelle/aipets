/**
 * 模型设置页。
 *
 * 模型清单从提供商接口拉取，选择结果只写 models 域。
 * 角色实例与实例外观也在这里管理，对齐原项目。
 */

import { useState } from 'react'

import { activeProvider } from '@/config/domains/providers'
import { useModelsStore } from '@/config/domains/models'
import { listModels } from '@/config/provider-health'
import { InstanceManager } from '@/ui/components/instance-manager'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select'

export function ModelsPage() {
  const available = useModelsStore(state => state.available)
  const selected = useModelsStore(state => state.selected)
  const setAvailable = useModelsStore(state => state.setAvailable)
  const select = useModelsStore(state => state.select)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async () => {
    const provider = activeProvider()
    if (!provider) {
      setMessage('请先配置模型提供商')
      return
    }

    setLoading(true)
    try {
      const models = await listModels(provider)
      if (models.length === 0) {
        setMessage('接口没有返回任何模型')
      }
      else {
        setAvailable(models)
        setMessage(null)
      }
    }
    catch {
      setMessage('获取模型列表失败，请检查接口地址与凭据')
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="当前模型" description="所有对话都用这个模型。">
        <SettingRow label="模型">
          <Select value={selected ?? undefined} onValueChange={select}>
            <SelectTrigger>
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {available.map(model => (
                <SelectItem key={model} value={model}>{model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            {loading ? '拉取中…' : '从接口拉取模型'}
          </Button>
        </div>

        {message
          ? <p className="text-xs text-destructive">{message}</p>
          : null}
      </SettingSection>

      <InstanceManager />
    </div>
  )
}

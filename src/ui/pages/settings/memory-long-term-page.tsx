/**
 * 长期记忆设置页：开关、子页入口与运行状态。
 */

import { Link } from 'react-router'

import { useMemoryStore } from '@/config/domains/memory'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Switch } from '@/ui/components/ui/switch'

function formatTime(value: number | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录'
}

export function MemoryLongTermPage() {
  const enabled = useMemoryStore(state => state.longTermEnabled)
  const middlewareEnabled = useMemoryStore(state => state.middlewareEnabled)
  const toolsEnabled = useMemoryStore(state => state.toolsEnabled)
  const update = useMemoryStore(state => state.updateSettings)
  const count = useMemoryStore(state => state.entries.length)

  const lastExtractAt = useMemoryStore(state => state.lastExtractAt)
  const lastExtractOk = useMemoryStore(state => state.lastExtractOk)
  const lastExtractCount = useMemoryStore(state => state.lastExtractCount)
  const lastExtractError = useMemoryStore(state => state.lastExtractError)
  const lastInjectAt = useMemoryStore(state => state.lastInjectAt)
  const lastInjectOk = useMemoryStore(state => state.lastInjectOk)
  const lastInjectCount = useMemoryStore(state => state.lastInjectCount)
  const lastInjectChars = useMemoryStore(state => state.lastInjectChars)
  const lastInjectError = useMemoryStore(state => state.lastInjectError)
  const toolCallCount = useMemoryStore(state => state.toolCallCount)
  const lastToolName = useMemoryStore(state => state.lastToolName)
  const lastToolAt = useMemoryStore(state => state.lastToolAt)
  const lastToolError = useMemoryStore(state => state.lastToolError)

  const extractText = lastExtractOk === null
    ? '暂无记录'
    : lastExtractOk ? `成功 · 写入/更新 ${lastExtractCount} 条` : '失败'
  const extractDetail = [
    `时间：${formatTime(lastExtractAt)}`,
    lastExtractOk === false && lastExtractError ? `原因：${lastExtractError}` : '',
  ].filter(Boolean).join('；')

  const injectText = lastInjectOk === null
    ? '暂无记录'
    : lastInjectOk ? `${lastInjectCount} 条 / ${lastInjectChars} 字符` : '失败'
  const injectDetail = [
    `时间：${formatTime(lastInjectAt)}`,
    lastInjectOk === false && lastInjectError ? `原因：${lastInjectError}` : '',
  ].filter(Boolean).join('；')

  const toolDetail = [
    lastToolName ? `最近调用：${lastToolName}（${formatTime(lastToolAt)}）` : '尚未调用',
    lastToolError ? `失败原因：${lastToolError}` : '',
  ].filter(Boolean).join('；')

  return (
    <div className="max-w-2xl">
      <SettingSection title="长期记忆" description="记住主人的偏好与设定，在模型调用前按预算注入。">
        <SettingRow label="启用长期记忆">
          <Switch checked={enabled} onCheckedChange={longTermEnabled => update({ longTermEnabled })} />
        </SettingRow>

        <SettingRow label="自动注入" description="每轮按实例与当前输入挑选记忆，作为独立的系统片段">
          <Switch
            checked={middlewareEnabled}
            disabled={!enabled}
            onCheckedChange={value => update({ middlewareEnabled: value })}
          />
        </SettingRow>

        <SettingRow label="记忆工具" description="允许模型检索、写入与遗忘记忆">
          <Switch
            checked={toolsEnabled}
            disabled={!enabled}
            onCheckedChange={value => update({ toolsEnabled: value })}
          />
        </SettingRow>

        <SettingRow label="记忆条目" description={`已保存 ${count} 条`}>
          <Link className="text-sm text-primary" to="/settings/modules/memory-long-term/memories">
            管理记忆
          </Link>
        </SettingRow>

        <SettingRow label="提示词配方" description="附加到系统提示词">
          <Link className="text-sm text-primary" to="/settings/modules/memory-long-term/recipes">
            管理配方
          </Link>
        </SettingRow>
      </SettingSection>

      <SettingSection title="运行状态" description="最近一次记忆写入、注入与工具调用，便于排查记忆为什么没生效。">
        <SettingRow label="上次提取" description={extractDetail}>
          <span className={lastExtractOk === false ? 'text-sm text-destructive' : 'text-sm'}>
            {extractText}
          </span>
        </SettingRow>

        <SettingRow label="上次自动注入" description={injectDetail}>
          <span className={lastInjectOk === false ? 'text-sm text-destructive' : 'text-sm'}>
            {injectText}
          </span>
        </SettingRow>

        <SettingRow label="记忆工具调用" description={toolDetail}>
          <span className={lastToolError ? 'text-sm text-destructive' : 'text-sm'}>
            {`累计 ${toolCallCount} 次`}
          </span>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

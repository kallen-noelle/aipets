/**
 * 预置提供商卡片。
 *
 * 只显示支持当前用途的预置，点击即添加并进入详情页补 Key。
 * 已经保存过的预置显示「已配置」，点开已有的提供商。
 */

import {
  providerPresets,
  type Provider,
  type ProviderCapability,
  type ProviderPreset,
} from '@/config/domains/providers'

interface ProviderPresetPickerProps {
  capability: ProviderCapability
  providers: Provider[]
  onOpen: (preset: ProviderPreset) => void
}

export function ProviderPresetPicker(props: ProviderPresetPickerProps) {
  const presets = providerPresets.filter(preset => preset.capabilities.includes(props.capability))

  if (presets.length === 0)
    return <p className="text-sm text-muted-foreground">这个用途还没有内置提供商。</p>

  /** 预置已保存过时，用它的地址判断。 */
  const saved = (preset: ProviderPreset) => props.providers.find(item => item.baseUrl === preset.baseUrl)

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {presets.map((preset) => {
        const existing = saved(preset)

        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => props.onOpen(preset)}
            className="flex flex-col gap-1 rounded-lg border p-3 text-left transition hover:bg-muted"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{existing?.label ?? preset.label}</span>
              {existing?.apiKey
                ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600">
                      已配置
                    </span>
                  )
                : null}
            </span>
            <span className="text-xs text-muted-foreground">{preset.description}</span>
            <span className="truncate text-xs text-muted-foreground">{preset.baseUrl}</span>
          </button>
        )
      })}
    </div>
  )
}

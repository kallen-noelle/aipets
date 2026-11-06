/**
 * 模型实例构建。
 *
 * 配置读取都发生在这里：界面层不直接拼装模型参数。
 */

import { ChatOpenAI } from '@langchain/openai'

import { useChatConfigStore } from '@/config/domains/chat'
import { useModelsStore } from '@/config/domains/models'
import { activeProvider, useProvidersStore } from '@/config/domains/providers'

export class MissingConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingConfigError'
  }
}

export interface ChatModelOptions {
  /** 覆盖全局模型。 */
  model?: string
  /** 覆盖激活提供商。 */
  providerId?: string
}

/** 按当前配置创建聊天模型，缺配置时抛出可读错误。 */
export function createChatModel(options: ChatModelOptions = {}): ChatOpenAI {
  const provider = options.providerId
    ? useProvidersStore.getState().items.find(item => item.id === options.providerId) ?? activeProvider()
    : activeProvider()
  if (!provider)
    throw new MissingConfigError('尚未选择模型提供商')

  if (!provider.apiKey)
    throw new MissingConfigError('提供商缺少 API Key')

  const model = options.model?.trim() || useModelsStore.getState().selected
  if (!model)
    throw new MissingConfigError('尚未选择模型')

  const { temperature, topP, temperatureEnabled, topPEnabled } = useChatConfigStore.getState()

  return new ChatOpenAI({
    model,
    apiKey: provider.apiKey,
    // 未开启的采样参数不发送，避免不支持该参数的模型报错。
    ...(temperatureEnabled ? { temperature } : {}),
    ...(topPEnabled ? { topP } : {}),
    configuration: {
      baseURL: provider.baseUrl.replace(/\/+$/, ''),
      // 兼容部分不校验 User-Agent 的网关。
      dangerouslyAllowBrowser: true,
    },
  })
}

/**
 * 提供商凭据读取。
 *
 * 语音与图像模块共用，避免各自重复拼装接口地址。
 */

import { activeProvider, useProvidersStore } from './domains/providers'

export class MissingProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingProviderError'
  }
}

export interface ProviderCredentials {
  baseUrl: string
  apiKey: string
}

/** 读取提供商凭据。传 id 时取指定提供商，否则取激活项。 */
export function providerCredentials(providerId?: string): ProviderCredentials {
  const provider = providerId
    ? useProvidersStore.getState().items.find(item => item.id === providerId)
    : activeProvider()
  if (!provider)
    throw new MissingProviderError('尚未选择模型提供商')
  if (!provider.apiKey)
    throw new MissingProviderError('提供商缺少 API Key')

  return { baseUrl: provider.baseUrl.replace(/\/+$/, ''), apiKey: provider.apiKey }
}

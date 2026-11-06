/**
 * 提供商连通性检查。
 *
 * axios 在这里使用，页面只拿结果，不关心请求细节。
 */

import axios from 'axios'

import type { Provider } from './domains/providers'

export interface ProviderCheck {
  ok: boolean
  message: string
}

function authHeaders(provider: Provider) {
  return provider.apiKey
    ? { Authorization: `Bearer ${provider.apiKey}` }
    : {}
}

/** 请求模型列表，验证地址与凭据是否可用。 */
export async function listModels(provider: Provider): Promise<string[]> {
  const base = provider.baseUrl.replace(/\/+$/, '')
  const response = await axios.get<{ data?: Array<{ id?: string }> }>(`${base}/models`, {
    headers: authHeaders(provider),
    timeout: 8000,
  })

  return (response.data.data ?? [])
    .map(item => item.id)
    .filter((id): id is string => Boolean(id))
}

/** 连通性测试，失败时返回可读原因。 */
export async function checkProvider(provider: Provider): Promise<ProviderCheck> {
  try {
    const models = await listModels(provider)
    return {
      ok: true,
      message: models.length > 0
        ? `连接正常，可用模型 ${models.length} 个`
        : '连接正常，但未返回模型列表',
    }
  }
  catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status === 401)
        return { ok: false, message: '凭据无效（401）' }
      if (status)
        return { ok: false, message: `接口返回 ${status}` }
      return { ok: false, message: error.message }
    }

    return { ok: false, message: '无法连接接口' }
  }
}

/**
 * 图像生成。
 *
 * 走 OpenAI 兼容的 `/images/generations`，优先用 base64 直接显示，避免
 * 远程地址过期。
 */

import axios from 'axios'

import { providerCredentials } from '@/config/provider-access'
import { useImageStore } from '@/config/domains/image'

interface ImageResponse {
  data?: Array<{ b64_json?: string, url?: string }>
}

export async function generateImage(prompt: string): Promise<string> {
  const { baseUrl, apiKey } = providerCredentials()
  const { model, size } = useImageStore.getState()

  const response = await axios.post<ImageResponse>(
    `${baseUrl}/images/generations`,
    { model, prompt, size, n: 1 },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 60_000,
    },
  )

  const item = response.data.data?.[0]
  if (item?.b64_json)
    return `data:image/png;base64,${item.b64_json}`

  if (item?.url)
    return item.url

  throw new Error('接口没有返回图片')
}

/**
 * 连接设置页：事件中继地址与测试。
 */

import { useState } from 'react'

import { useConnectionStore } from '@/config/domains/connection'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Input } from '@/ui/components/ui/input'

export function ConnectionPage() {
  const config = useConnectionStore()
  const update = useConnectionStore(state => state.update)
  const [status, setStatus] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const test = () => {
    const url = config.url.trim()
    if (!url) {
      setStatus('请先填写服务器地址')
      return
    }

    setTesting(true)
    setStatus('连接中…')

    const token = config.token.trim()
    const target = token
      ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
      : url

    let socket: WebSocket
    try {
      socket = new WebSocket(target)
    }
    catch {
      setTesting(false)
      setStatus('地址格式不正确')
      return
    }

    const timer = window.setTimeout(() => {
      socket.close()
      setTesting(false)
      setStatus('连接超时（6 秒）')
    }, 6000)

    socket.addEventListener('open', () => {
      window.clearTimeout(timer)
      socket.close()
      setTesting(false)
      setStatus('连接成功')
    })

    socket.addEventListener('error', () => {
      window.clearTimeout(timer)
      socket.close()
      setTesting(false)
      setStatus('连接失败，请检查地址与服务状态')
    })
  }

  return (
    <div className="max-w-2xl">
      <SettingSection title="连接" description="桌宠与外部事件中继之间的 WebSocket。" >
        <SettingRow label="服务器地址">
          <Input
            value={config.url}
            placeholder="wss://example.com/relay"
            onChange={event => update({ url: event.target.value })}
          />
        </SettingRow>

        <SettingRow label="认证令牌" description="可选">
          <Input
            type="password"
            value={config.token}
            onChange={event => update({ token: event.target.value })}
          />
        </SettingRow>

        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? '测试中…' : '测试连接'}
        </Button>

        {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      </SettingSection>
    </div>
  )
}

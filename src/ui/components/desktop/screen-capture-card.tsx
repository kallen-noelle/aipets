/**
 * 屏幕捕获：预览主屏幕，Windows 下同时带上系统声音。
 *
 * 捕获流只在本页显示，不进入对话链路。
 */

import { useEffect, useRef, useState } from 'react'

import { SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

export function ScreenCaptureCard() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current)
      videoRef.current.srcObject = stream
  }, [stream])

  // 页面关闭或流被替换时停止旧轨道，避免后台继续采集。
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [stream])

  const start = async () => {
    setError(null)
    setCapturing(true)
    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      next.getVideoTracks()[0]?.addEventListener('ended', () => setStream(null))
      setStream(next)
    }
    catch (cause) {
      setError(errorText(cause))
    }
    finally {
      setCapturing(false)
    }
  }

  const stop = () => {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null)
  }

  const hasAudio = Boolean(stream?.getAudioTracks().length)

  return (
    <SettingSection
      title="屏幕捕获"
      description="捕获主屏幕；Windows 下系统声音随视频一起输出。"
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={capturing || Boolean(stream)} onClick={() => void start()}>
          {capturing ? '正在请求…' : '开始捕获'}
        </Button>
        <Button variant="outline" size="sm" disabled={!stream} onClick={stop}>
          停止捕获
        </Button>
      </div>

      {stream
        ? (
            <p className="text-xs text-muted-foreground">
              {hasAudio ? '画面与系统声音正在采集。' : '画面正在采集，系统声音不可用。'}
            </p>
          )
        : null}

      {error ? <p className="text-xs text-destructive">屏幕捕获失败：{error}</p> : null}

      <video ref={videoRef} className="w-full rounded-lg border" muted autoPlay playsInline />
    </SettingSection>
  )
}

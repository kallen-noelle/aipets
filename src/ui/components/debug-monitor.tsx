/**
 * 临时调试面板：显示导演配置、最近计划、舞台视频状态与跨窗口事件。
 *
 * 只用于排查“对话后不放风筝”的链路问题，验证完成后可以删除。
 */

import { useSyncExternalStore } from 'react'

import { parseAmbientProgram, totalHoldMs } from '@/character/ambient'
import { useAmbientStore } from '@/config/domains/ambient'
import { useAnimationStore } from '@/config/domains/animation'
import { useModelsStore } from '@/config/domains/models'
import {
  clearDebugEvents,
  getDebugSnapshot,
  subscribeDebug,
  type DebugSource,
} from '@/debug/monitor'
import { chatController } from '@/llm/chat-controller'

const SOURCE_COLOR: Record<DebugSource, string> = {
  emit: 'text-sky-600',
  stage: 'text-emerald-600',
  director: 'text-amber-600',
  ambient: 'text-violet-600',
  chat: 'text-rose-600',
}

const subscribeChat = (listener: () => void) => chatController.subscribe(listener)
const getChat = () => chatController.getSnapshot()

/** 从资源地址里取出文件名。 */
function fileName(src: string): string {
  if (!src)
    return '(空)'

  try {
    return decodeURIComponent(src.split('/').pop() ?? src)
  }
  catch {
    return src.split('/').pop() ?? src
  }
}

function timeText(at: number): string {
  const date = new Date(at)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function seconds(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(1)}s`
}

function hours(ms: number): string {
  return `${Math.round((ms / 3_600_000) * 10) / 10}h`
}

export function DebugMonitor() {
  const animation = useAnimationStore()
  const chatModel = useModelsStore(state => state.selected)
  const ambientStore = useAmbientStore()
  const debug = useSyncExternalStore(subscribeDebug, getDebugSnapshot)
  const chat = useSyncExternalStore(subscribeChat, getChat)

  // 生产构建里不显示，避免把调试面板带出去。
  if (!import.meta.env.DEV)
    return null

  const stage = debug.stage
  const events = [...debug.events].reverse().slice(0, 14)
  const ambientRecord = stage?.instanceId ? ambientStore.records[stage.instanceId] : undefined
  const ambientProgram = ambientRecord ? parseAmbientProgram(ambientRecord.program) : null

  return (
    <div className="fixed bottom-2 left-2 z-50 flex max-h-[46vh] w-[520px] max-w-[calc(100vw-1rem)] flex-col gap-2 overflow-auto rounded-lg border bg-background/95 p-3 font-mono text-[11px] shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="font-sans text-xs font-semibold">临时监控</span>
        <button
          type="button"
          className="rounded border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
          onClick={clearDebugEvents}
        >
          清空事件
        </button>
      </div>

      <section className="space-y-0.5">
        <div className="font-sans text-[11px] font-semibold text-muted-foreground">LLM 导演</div>
        <div>
          模型：
          {animation.directorModel
            ? <span>{animation.directorModel}</span>
            : chatModel
              ? <span>{chatModel}（跟随对话）</span>
              : <span className="text-destructive">（未配置）</span>}
        </div>
        <div>最近计划：{animation.lastClips.length ? animation.lastClips.join(' → ') : '（无）'}</div>
        {animation.lastReason ? <div>理由：{animation.lastReason}</div> : null}
        {animation.lastError
          ? <div className="text-destructive">导演错误：{animation.lastError}</div>
          : null}
      </section>

      <section className="space-y-0.5">
        <div className="font-sans text-[11px] font-semibold text-muted-foreground">聊天</div>
        <div>
          busy={String(chat.busy)}
          {' '}
          streaming={chat.streaming.length}
          字
          {chat.error ? <span className="text-destructive">｜错误：{chat.error}</span> : null}
        </div>
      </section>

      <section className="space-y-0.5">
        <div className="font-sans text-[11px] font-semibold text-muted-foreground">
          舞台
          {stage ? `｜${stage.instanceId || '无实例'}｜${timeText(stage.at)}` : ''}
        </div>
        {stage
          ? (
              <>
                <div>
                  performing=
                  {String(stage.performing)}
                  {' '}
                  ambient=
                  {String(stage.ambientActive)}
                  {' '}
                  clip=
                  {stage.ambientClipIndex === null ? '-' : stage.ambientClipIndex + 1}
                  {' '}
                  paused=
                  {String(stage.ambientPaused)}
                  {' '}
                  state=
                  {stage.state ?? '-'}
                </div>
                {stage.videos.map((video, index) => (
                  <div key={index} className={video.active ? 'text-foreground' : 'text-muted-foreground/60'}>
                    {video.active ? '前台' : '后台'}
                    {' '}
                    {fileName(video.src)}
                    {' '}
                    paused=
                    {String(video.paused)}
                    {' '}
                    loop=
                    {String(video.loop)}
                    {' '}
                    t=
                    {seconds(video.currentTime)}
                    /
                    {seconds(video.duration)}
                    {video.error ? <span className="text-destructive">｜{video.error}</span> : null}
                  </div>
                ))}
              </>
            )
          : <div className="text-muted-foreground">舞台尚未上报</div>}
      </section>

      <section className="space-y-0.5">
        <div className="font-sans text-[11px] font-semibold text-muted-foreground">环境编排</div>
        {!stage
          ? <div className="text-muted-foreground">舞台尚未上报实例</div>
          : !ambientRecord
            ? <div className="text-muted-foreground">（该实例暂无有效编排）</div>
            : !ambientProgram
              ? <div className="text-destructive">编排数据不合法</div>
              : (
                  <>
                    <div>
                      生成于
                      {' '}
                      {timeText(ambientRecord.generatedAt)}
                      ｜
                      {ambientProgram.clips.length}
                      {' '}
                      动作｜总长动作时长
                      {' '}
                      {hours(totalHoldMs(ambientProgram.clips))}
                    </div>
                    {ambientProgram.reason
                      ? <div className="text-muted-foreground">理由：{ambientProgram.reason}</div>
                      : null}
                    {ambientRecord.error
                      ? <div className="text-destructive">最近更新失败：{ambientRecord.error}</div>
                      : null}
                    {ambientProgram.clips.map((clip, index) => (
                      <div
                        key={index}
                        className={stage.ambientClipIndex === index ? 'font-semibold text-foreground' : ''}
                      >
                        {stage.ambientClipIndex === index ? '▶' : '·'}
                        {' '}
                        {index + 1}
                        .
                        {clip.name}
                        ｜
                        {clip.durationMs ? hours(clip.durationMs) : '短片，不计时'}
                      </div>
                    ))}
                  </>
                )}
      </section>

      <section className="space-y-0.5">
        <div className="font-sans text-[11px] font-semibold text-muted-foreground">事件</div>
        {events.length === 0
          ? <div className="text-muted-foreground">（无）</div>
          : events.map(event => (
              <div key={event.id} className="break-all">
                <span className="text-muted-foreground">{timeText(event.at)}</span>
                {' '}
                <span className={SOURCE_COLOR[event.source]}>{event.source}</span>
                {' '}
                <span className="font-semibold">{event.kind}</span>
                {event.detail ? <span className="text-muted-foreground">｜{event.detail}</span> : null}
              </div>
            ))}
      </section>
    </div>
  )
}

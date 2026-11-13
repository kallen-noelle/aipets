/**
 * 临时调试面板：每个角色实例一个独立面板。
 *
 * 只用于排查“对话后角色不放动作/环境编排失败”的链路问题，
 * 验证完成后可以删除。
 */

import { useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'

import { parseAmbientProgram, totalHoldMs } from '@/character/ambient'
import { useAmbientStore } from '@/config/domains/ambient'
import { useCharacterStore } from '@/config/domains/character'
import {
  clearDebugEvents,
  getDebugSnapshot,
  subscribeDebug,
  type DebugSource,
  type StageDebugSnapshot,
} from '@/debug/monitor'

const SOURCE_COLOR: Record<DebugSource, string> = {
  emit: 'text-sky-600',
  stage: 'text-emerald-600',
  director: 'text-amber-600',
  ambient: 'text-violet-600',
  chat: 'text-rose-600',
}

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

function StageSection({ stage }: { stage: StageDebugSnapshot | undefined }) {
  if (!stage)
    return <div className="text-muted-foreground">舞台尚未上报该实例</div>

  // 空快照代表舞台已挂载，但首个视频还没进入播放器。
  if (stage.state === null && stage.videos.length === 0)
    return <div className="text-muted-foreground">舞台已挂载，正在加载素材…</div>

  return (
    <>
      <div>
        state=
        {stage.state ?? '-'}
        {' '}
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
}

export interface DebugMonitorProps {
  instanceId: string
}

export function DebugMonitor({ instanceId }: DebugMonitorProps) {
  const debug = useSyncExternalStore(subscribeDebug, getDebugSnapshot)
  const instances = useCharacterStore(state => state.instances)
  const activeInstanceId = useCharacterStore(state => state.activeInstanceId)
  const record = useAmbientStore(state => state.records[instanceId])
  // 每个实例的面板独立收起，互不影响。
  const [collapsed, setCollapsed] = useState(false)

  // 生产构建里不显示，避免把调试面板带出去。
  if (!import.meta.env.DEV)
    return null

  const characterId = instances.find(item => item.id === instanceId)?.characterId ?? ''
  const stage = debug.stages.find(item => item.instanceId === instanceId)
  const program = record ? parseAmbientProgram(record.program) : null
  const currentIndex = stage?.ambientClipIndex ?? null
  const currentClip = program && currentIndex !== null ? program.clips[currentIndex] : undefined
  const active = instanceId === activeInstanceId
  // 只显示属于本实例的事件，多实例之间不再互相刷屏。
  const events = [...debug.events]
    .filter(event => event.instanceId === instanceId)
    .reverse()
    .slice(0, 12)

  if (collapsed) {
    return (
      <button
        type="button"
        className={`pointer-events-auto shrink-0 rounded border bg-background/90 px-2 py-1 font-sans text-[11px] shadow backdrop-blur ${
          active ? 'text-primary' : 'text-muted-foreground'
        }`}
        onClick={() => setCollapsed(false)}
      >
        {characterId || '实例'}
        ·监控
      </button>
    )
  }

  return (
    <div
      className={`pointer-events-auto flex max-h-[46vh] w-[400px] shrink-0 flex-col gap-2 overflow-auto rounded-lg border bg-background/95 p-3 font-mono text-[11px] shadow-xl backdrop-blur ${
        active ? 'border-primary/60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-sans text-xs font-semibold">
            {characterId || '未知角色'}
            {' '}
            监控
          </div>
          <div className="break-all text-muted-foreground">
            {instanceId}
            {stage ? `｜${timeText(stage.at)}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="只清空本实例事件"
            className="rounded border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => clearDebugEvents(instanceId)}
          >
            清空
          </button>
          <button
            type="button"
            aria-label="隐藏监控"
            title="隐藏监控"
            className="rounded border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => setCollapsed(true)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <section className="space-y-0.5">
        <div className="font-sans text-[11px] font-semibold text-muted-foreground">舞台</div>
        <StageSection stage={stage} />
      </section>

      <section className="space-y-0.5">
        <div className="font-sans text-[11px] font-semibold text-muted-foreground">环境编排</div>
        {!record
          ? <div className="text-muted-foreground">该实例暂无有效编排</div>
          : !program
            ? <div className="text-destructive">编排数据不合法</div>
            : (
                <>
                  <div>
                    生成于
                    {' '}
                    {timeText(record.generatedAt)}
                    ｜
                    {program.clips.length}
                    {' '}
                    动作｜
                    {hours(totalHoldMs(program.clips))}
                  </div>
                  {currentClip
                    ? (
                        <div>
                          当前：
                          {currentClip.name}
                          ｜
                          {currentClip.durationMs ? hours(currentClip.durationMs) : '短片'}
                        </div>
                      )
                    : null}
                  {program.reason
                    ? <div className="text-muted-foreground">理由：{program.reason}</div>
                    : null}
                  {record.error
                    ? <div className="text-destructive">最近更新失败：{record.error}</div>
                    : null}
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">展开编排</summary>
                    {program.clips.map((clip, index) => (
                      <div
                        key={index}
                        className={index === currentIndex ? 'font-semibold text-foreground' : ''}
                      >
                        {index === currentIndex ? '▶' : '·'}
                        {' '}
                        {index + 1}
                        .
                        {clip.name}
                        ｜
                        {clip.durationMs ? hours(clip.durationMs) : '短片，不计时'}
                      </div>
                    ))}
                  </details>
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

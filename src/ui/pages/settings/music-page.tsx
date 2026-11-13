/**
 * 音乐设置页：弹琴与唱歌共用一套曲谱与音频管线，只在曲目与音色上区分。
 */

import { playScore, stopPerformance } from '@/audio/performance'
import { usePlaybackStore } from '@/audio/playback-store'
import { PIANO_SCORES, SING_SCORES, scoreDuration, type Score } from '@/audio/score'
import { useMusicStore } from '@/config/domains/music'
import { InstrumentView } from '@/ui/components/instrument-view'
import { SettingRow, SettingSection } from '@/ui/components/setting-section'
import { Button } from '@/ui/components/ui/button'
import { Slider } from '@/ui/components/ui/slider'
import { Switch } from '@/ui/components/ui/switch'

function formatDuration(seconds: number): string {
  return `${Math.round(seconds)} 秒`
}

interface MusicPageProps {
  mode: 'piano' | 'sing'
  scores: Score[]
}

/** 弹琴与唱歌共用的设置布局，差别只在曲目和演奏形态。 */
function MusicSettings({ mode, scores }: MusicPageProps) {
  const enabled = useMusicStore(state => state.enabled)
  const volume = useMusicStore(state => state.volume)
  const update = useMusicStore(state => state.update)
  const playing = usePlaybackStore(state => state.active)
  const playingTitle = usePlaybackStore(state => state.title)
  const itemEnabled = useMusicStore(state => (mode === 'piano' ? state.pianoEnabled : state.singingEnabled))

  const toggleItem = (value: boolean) => {
    update(mode === 'piano' ? { pianoEnabled: value } : { singingEnabled: value })
  }

  const label = mode === 'piano' ? '弹琴' : '唱歌'

  return (
    <div className="max-w-2xl">
      <SettingSection
        title={label}
        description={mode === 'piano'
          ? '角色可以在对话里主动弹一段，也能响应点播。声音由 Web Audio 实时合成，不加载采样包。'
          : '角色按曲谱合成旋律并显示歌词。与弹琴共用同一条播放与打断管线。'}
      >
        <SettingRow label="总开关" description="关闭后弹琴与唱歌都从工具列表移除。">
          <Switch checked={enabled} onCheckedChange={value => update({ enabled: value })} />
        </SettingRow>

        <SettingRow label={`启用${label}`}>
          <Switch checked={itemEnabled} onCheckedChange={toggleItem} />
        </SettingRow>

        <SettingRow label="音量" description={`当前 ${Math.round(volume * 100)}%`}>
          <Slider
            min={0}
            max={100}
            value={[Math.round(volume * 100)]}
            onValueChange={value => update({ volume: value[0] / 100 })}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="曲目" description="模型会按用户点播的曲名选择，匹配不到时用第一首。">
        <div className="space-y-2">
          {scores.map(score => (
            <div key={score.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">{score.title}</div>
                <div className="text-xs text-muted-foreground">
                  {score.notes.length}
                  {' '}
                  个音符 · 约
                  {' '}
                  {formatDuration(scoreDuration(score))}
                </div>
                {score.lyrics?.length
                  ? (
                      <div className="text-xs text-muted-foreground">
                        歌词：
                        {score.lyrics.map(line => line.text).join(' / ')}
                      </div>
                    )
                  : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!enabled || !itemEnabled}
                onClick={() => playScore(score, mode)}
              >
                试听
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {playing && playingTitle ? `正在播放：${playingTitle}` : '当前没有播放'}
          </span>
          <Button size="sm" variant="ghost" disabled={!playing} onClick={stopPerformance}>
            停止
          </Button>
        </div>

        {/* 试听时直接在这里看到琴键与歌词反馈。 */}
        <InstrumentView />
      </SettingSection>
    </div>
  )
}

export function PianoPage() {
  return <MusicSettings mode="piano" scores={PIANO_SCORES} />
}

export function SingingPage() {
  return <MusicSettings mode="sing" scores={SING_SCORES} />
}

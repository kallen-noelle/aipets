/**
 * 角色舞台：桌宠窗口与舞台页里渲染单个角色实例的唯一入口。
 *
 * 对齐原项目：外观（缩放、镜像、响应点击）来自实例，实例列表顺序即层级。
 * 组件只负责挂载、清理与事件转发。资源加载、播放、调度、手势判定都在
 * `character/` 模块，这里不写业务规则。
 */

import { useEffect, useRef } from 'react'

import { clipUrl, getCharacter, loadCharactersCatalog } from '@/character/catalog'
import type { AmbientProgram } from '@/character/ambient'
import { ambientClipAt, parseAmbientProgram } from '@/character/ambient'
import { CharacterDirector } from '@/character/director'
import { DragPhysics } from '@/character/drag-physics'
import { GestureRecognizer } from '@/character/gesture'
import { AlphaHitboxObserver } from '@/character/hitbox-observer'
import { longActions } from '@/character/perform'
import { CharacterVideoPlayer } from '@/character/player'
import type { CharacterDefinition } from '@/character/types'
import { useAmbientStore } from '@/config/domains/ambient'
import {
  useCharacterStore,
  type InstanceAppearance,
} from '@/config/domains/character'
import { publishStageDebug, recordDebugEvent, removeStageDebug } from '@/debug/monitor'
import { getDesktopBridge } from '@/desktop/bridge'
import { onPetEvent } from '@/desktop/pet-events'
import { requestAmbientProgram } from '@/llm/ambient-service'

/**
 * 回复结束后等待多久尝试更新环境编排。
 *
 * 回复结束后等待 90 秒再请求环境编排，避免用户连续对话时频繁调用模型。
 */
const AMBIENT_REPLY_DELAY_MS = 90_000

export interface CharacterStageProps {
  characterId: string
  /** 实例外观，来自角色域的实例配置。 */
  appearance: InstanceAppearance
  /** 实例标识；提供后点击会切换当前对话实例。 */
  instanceId?: string
  /** 桌面端窗口拖拽与命中检测只对主实例启用。 */
  interactive?: boolean
  /** 拖拽时移动桌面窗口而不是页面元素，只用于桌宠窗口。 */
  windowDrag?: boolean
}

export function CharacterStage({
  characterId,
  appearance,
  instanceId,
  interactive = true,
  windowDrag: windowDragMode = false,
}: CharacterStageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // 外观变化通过订阅刷新，不重启动画，所以用 ref 保存最新值。
  const appearanceRef = useRef(appearance)
  useEffect(() => {
    appearanceRef.current = appearance
  }, [appearance])

  // 可交互标记会随当前对话实例切换，同样不重启角色。
  const interactiveRef = useRef(interactive)
  useEffect(() => {
    interactiveRef.current = interactive
  }, [interactive])

  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return

    // 桌宠窗口必须是完全透明的画布，见 index.css 的 pet-surface 规则。
    document.documentElement.classList.add('pet-surface')

    // 先上报空快照，让监控面板能区分“舞台未挂载”和“素材加载中”。
    publishStageDebug({
      at: Date.now(),
      instanceId: instanceId ?? '',
      performing: false,
      ambientActive: false,
      ambientClipIndex: null,
      ambientPaused: false,
      state: null,
      videos: [],
    })

    let player: CharacterVideoPlayer | null = null
    let director: CharacterDirector | null = null
    let observer: AlphaHitboxObserver | null = null
    let unsubscribePetEvent: (() => void) | null = null
    let unsubscribeStore: (() => void) | null = null
    /** 临时监控定时器。 */
    let debugTimer: number | null = null
    let cancelled = false

    /** 当前实例外观；设置页改动后立即生效。 */
    const currentAppearance = (): InstanceAppearance => {
      if (!instanceId)
        return appearanceRef.current

      const instance = useCharacterStore.getState().instances.find(item => item.id === instanceId)
      return instance?.appearance ?? appearanceRef.current
    }

    const bridge = getDesktopBridge()
    const gestures = new GestureRecognizer()
    // 只有桌宠窗口把拖拽交给窗口；聊天与设置窗里的角色仍在页面内拖动。
    const windowDrag = Boolean(bridge) && windowDragMode
    let drag: DragPhysics | null = null
    let pointerActive = false
    let lastX = 0
    let lastY = 0
    let lastTime = 0

    // 回复结束后等待 AMBIENT_REPLY_DELAY_MS 再尝试更新环境编排。
    let ambientTimer: number | null = null
    let ambientGeneration = 0
    let currentCharacter: CharacterDefinition | null = null
    /** 本轮回复结束时间，用来判断等待时间是否已过。 */
    let replyEndedAt: number | null = null
    /** 等待结束后生成的环境编排，等当前表演播完再接管。 */
    let pendingAmbient: { program: AmbientProgram; generatedAt: number } | null = null

    const clearAmbientTimer = () => {
      if (ambientTimer !== null)
        window.clearTimeout(ambientTimer)
      ambientTimer = null
    }

    /** 启动环境编排；表演播放期间先挂起，播完再接上。 */
    const applyAmbient = (program: AmbientProgram, generatedAt: number) => {
      if (director?.performingActive) {
        pendingAmbient = { program, generatedAt }
        recordDebugEvent('ambient', 'deferred', `表演中，${program.clips.length} 个动作等待接管`, instanceId)
        return
      }

      pendingAmbient = null
      recordDebugEvent('ambient', 'start', `${program.clips.length} 个动作`, instanceId)
      director?.startAmbient(program, ambientClipAt(program, generatedAt, Date.now()))
    }

    /** 恢复已保存的环境编排，并跳到当前时间对应的阶段。 */
    const startStoredAmbient = (): boolean => {
      if (!instanceId || !currentCharacter)
        return false

      const record = useAmbientStore.getState().records[instanceId]
      if (!record || record.characterId !== currentCharacter.id)
        return false

      const program = parseAmbientProgram(record.program)
      if (!program || !longActions(currentCharacter).length)
        return false

      applyAmbient(program, record.generatedAt)
      return true
    }

    /**
     * 表演播完后的衔接：
     * 不足等待时间回到规则导演；超过时旧编排或新编排立即接上。
     */
    function handlePerformanceEnd(): void {
      const elapsed = replyEndedAt ? Date.now() - replyEndedAt : 0
      if (elapsed < AMBIENT_REPLY_DELAY_MS) {
        // 等待结束后的更新会自己启动编排，这里保持规则导演。
        return
      }

      if (pendingAmbient) {
        const pending = pendingAmbient
        pendingAmbient = null
        director?.startAmbient(
          pending.program,
          ambientClipAt(pending.program, pending.generatedAt, Date.now()),
        )
        return
      }

      if (!director?.ambientActive)
        startStoredAmbient()
    }

    const generateAmbient = async (token: number) => {
      const character = currentCharacter
      if (!character || !instanceId || cancelled || token !== ambientGeneration)
        return

      if (!longActions(character).length)
        return

      recordDebugEvent('ambient', 'generate', `实例 ${instanceId} 开始生成`, instanceId)

      const result = await requestAmbientProgram({
        character,
        instanceId,
        recentClips: director?.recentClips() ?? [],
      })

      if (cancelled || token !== ambientGeneration)
        return

      if (result.program) {
        const generatedAt = Date.now()
        useAmbientStore.getState().save({
          instanceId,
          characterId: character.id,
          program: result.program,
          generatedAt,
          error: '',
        })
        recordDebugEvent('ambient', 'saved', `${result.program.clips.length} 个动作`, instanceId)
        applyAmbient(result.program, generatedAt)
        return
      }

      recordDebugEvent('ambient', 'failed', result.error, instanceId)
      useAmbientStore.getState().fail(instanceId, result.error)
      // 更新失败时回到旧编排，并按当前时间定位阶段。
      if (!director?.ambientActive)
        startStoredAmbient()
    }

    const scheduleAmbient = () => {
      clearAmbientTimer()
      const token = ++ambientGeneration
      recordDebugEvent('ambient', 'schedule', `${AMBIENT_REPLY_DELAY_MS / 1000} 秒后生成`, instanceId)
      ambientTimer = window.setTimeout(() => {
        ambientTimer = null
        void generateAmbient(token)
      }, AMBIENT_REPLY_DELAY_MS)
    }

    /** 把偏移、缩放与镜像合成一个 CSS 变换。 */
    const applyTransforms = () => {
      const latest = currentAppearance()
      // 桌面版通过窗口大小实现缩放；网页版在页面内缩放并拖动元素。
      const scale = windowDrag ? 1 : latest.scale * (drag?.isDragging ? 0.97 : 1)
      const offset = windowDrag ? { x: 0, y: 0 } : (drag?.offset ?? { x: 0, y: 0 })
      container.style.transform =
        `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})${latest.mirror ? ' scaleX(-1)' : ''}`
      container.style.cursor = drag?.isDragging ? 'grabbing' : 'grab'
    }

    drag = new DragPhysics(
      () => {
        const rect = container.getBoundingClientRect()
        // 去掉当前偏移，得到元素未移动时的位置。
        const base = drag?.offset ?? { x: 0, y: 0 }
        const left = rect.left - base.x
        const top = rect.top - base.y
        const right = rect.right - base.x
        const bottom = rect.bottom - base.y
        return {
          minX: -left,
          maxX: window.innerWidth - right,
          minY: -top,
          maxY: window.innerHeight - bottom,
        }
      },
      applyTransforms,
    )

    const sample = (event: PointerEvent) => windowDrag
      ? { x: event.screenX, y: event.screenY, time: event.timeStamp }
      : { x: event.clientX, y: event.clientY, time: event.timeStamp }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0)
        return

      // 点击哪个实例，哪个实例成为对话目标。
      if (instanceId)
        useCharacterStore.getState().setActiveInstance(instanceId)

      // 桌面只允许可交互窗口拖窗口；网页里所有角色都能拖动。
      if (windowDrag && !interactiveRef.current)
        return

      gestures.down(sample(event))
      pointerActive = true
      lastX = event.clientX
      lastY = event.clientY
      lastTime = event.timeStamp

      if (windowDrag) {
        bridge?.beginPetDrag()
        return
      }

      container.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerActive)
        return

      const result = gestures.move(sample(event))

      if (windowDrag) {
        if (result === 'drag-started')
          director?.dispatch({ type: 'drag-started' })
        return
      }

      if (result === 'drag-started') {
        director?.dispatch({ type: 'drag-started' })
        drag?.start()
      }

      if (!drag?.isDragging)
        return

      drag.move(event.clientX - lastX, event.clientY - lastY, event.timeStamp - lastTime)
      lastX = event.clientX
      lastY = event.clientY
      lastTime = event.timeStamp
    }

    const finishPointer = (event: PointerEvent, allowTap: boolean) => {
      if (!pointerActive)
        return

      pointerActive = false
      const result = gestures.up(sample(event))

      if (windowDrag) {
        bridge?.endPetDrag()
        if (result === 'drag-ended')
          director?.dispatch({ type: 'drag-ended' })
        else if (allowTap && result === 'tap' && currentAppearance().clickEnabled)
          director?.dispatch({ type: 'petted' })
        return
      }

      if (container.hasPointerCapture(event.pointerId))
        container.releasePointerCapture(event.pointerId)

      if (result === 'drag-ended') {
        director?.dispatch({ type: 'drag-ended' })
        drag?.end()
      }
      else if (allowTap && result === 'tap' && currentAppearance().clickEnabled) {
        director?.dispatch({ type: 'petted' })
      }
    }

    const onPointerUp = (event: PointerEvent) => finishPointer(event, true)
    const onPointerCancel = (event: PointerEvent) => finishPointer(event, false)

    void (async () => {
      try {
        const catalog = await loadCharactersCatalog()
        if (cancelled)
          return

        const character = getCharacter(catalog, characterId)
        // 导演节奏来自 character 域，启动时读一次。
        const config = useCharacterStore.getState()
        player = new CharacterVideoPlayer(container, currentAppearance().fadeMs, Boolean(bridge))
        director = new CharacterDirector({
          character,
          player,
          idleIntervalMs: config.idleIntervalMs as [number, number],
          poolChance: config.poolChance,
        })
        director.setPerformEndListener(handlePerformanceEnd)

        // 先播一段待机片段，再交给导演循环。
        const first = character.states.idle[0]
        await player.play(clipUrl(character.id, first.segments[0]), { loop: first.loop })

        if (cancelled)
          return

        currentCharacter = character

        // 已保存的环境编排直接恢复，按生成时间换算到当前阶段。
        startStoredAmbient()

        // 环境编排先接管，规则循环启动后会直接等待。
        director.start()

        // 临时监控：每 500 毫秒上报导演与视频状态。
        if (import.meta.env.DEV) {
          const publish = () => {
            publishStageDebug({
              at: Date.now(),
              instanceId: instanceId ?? '',
              performing: director?.performingActive ?? false,
              ambientActive: director?.ambientActive ?? false,
              ambientClipIndex: director?.ambientClipIndex ?? null,
              ambientPaused: director?.ambientPaused ?? false,
              state: director?.state ?? null,
              videos: player?.debugVideos() ?? [],
            })
          }
          publish()
          debugTimer = window.setInterval(publish, 500)
        }

        if (bridge && interactiveRef.current) {
          observer = new AlphaHitboxObserver({
            container,
            video: () => player?.getActiveVideo() ?? null,
            onBounds: (bounds) => {
              if (!bridge)
                return

              // 镜像时画面水平翻转，点击区域也要跟着翻。
              const width = container.clientWidth
              const mirrored = currentAppearance().mirror
              bridge.reportPetHitbox(mirrored
                ? { ...bounds, x: width - bounds.x - bounds.width }
                : bounds)
            },
          })
          observer.start()

          // 角色缩放通过调整窗口大小实现，配置改动立即生效。
          bridge.setPetScale(currentAppearance().scale)
        }

        // 镜像与位置用 CSS 变换；桌面端的缩放改窗口尺寸。
        applyTransforms()
        unsubscribeStore = useCharacterStore.subscribe((state) => {
          const instance = instanceId
            ? state.instances.find(item => item.id === instanceId)
            : undefined
          if (bridge && interactiveRef.current)
            bridge.setPetScale(instance?.appearance.scale ?? appearanceRef.current.scale)
          applyTransforms()
        })

        container.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerCancel)

        // 聊天窗的事件：说话、回合开始、回复结束、表演计划与环境编排。
        unsubscribePetEvent = onPetEvent((event) => {
          recordDebugEvent('stage', event.kind, JSON.stringify(event), instanceId)
          const forThis = 'instanceId' in event && event.instanceId === instanceId

          if (event.kind === 'speech-started') {
            director?.dispatch({ type: 'speech-started' })
            return
          }
          if (event.kind === 'speech-ended') {
            director?.dispatch({ type: 'speech-ended' })
            return
          }

          if (!forThis)
            return

          if (event.kind === 'turn-started') {
            ambientGeneration++
            replyEndedAt = null
            pendingAmbient = null
            clearAmbientTimer()
            director?.cancelPerform()
            director?.stopAmbient()
            return
          }

          if (event.kind === 'reply-ended') {
            replyEndedAt = Date.now()
            // 已有编排立即接上；正在表演时等表演结束再判断。
            if (!director?.performingActive)
              startStoredAmbient()
            scheduleAmbient()
            return
          }

          if (event.kind === 'ambient-refresh') {
            const token = ++ambientGeneration
            clearAmbientTimer()
            void generateAmbient(token)
            return
          }

          if (event.kind === 'perform')
            director?.perform(event.steps)
        })
      }
      catch (error) {
        // 资源加载失败时窗口保持透明，不阻塞其他窗口。
        console.warn('[aipets] 角色舞台加载失败', error)
        recordDebugEvent(
          'stage',
          'load-error',
          error instanceof Error ? error.message : String(error),
          instanceId,
        )
      }
    })()

    return () => {
      cancelled = true
      ambientGeneration++
      clearAmbientTimer()
      if (debugTimer !== null)
        window.clearInterval(debugTimer)
      // 卸载后不再保留该实例的调试快照，多实例时面板不会留下幽灵数据。
      removeStageDebug(instanceId ?? '')
      drag?.dispose()
      observer?.stop()
      unsubscribePetEvent?.()
      unsubscribeStore?.()
      director?.setPerformEndListener(null)
      director?.destroy()
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      container.style.transform = ''
      container.style.cursor = ''
      player?.destroy()
    }
  }, [characterId, instanceId, windowDragMode])

  return <div ref={containerRef} className="relative h-full w-full cursor-grab touch-none select-none overflow-visible active:cursor-grabbing" />
}

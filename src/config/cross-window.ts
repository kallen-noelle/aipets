/**
 * 跨窗口配置同步。
 *
 * 桌宠窗、聊天窗、设置窗各有独立的 React 上下文，但共用同一份
 * localStorage。每个域注册一个 `storage` 监听，任一窗口改动后其他窗口
 * 立即拿到新状态，角色与缩放不需要重开窗口才生效。
 */

import { syncAcrossWindows } from './persistence'

import { useAmbientStore } from './domains/ambient'
import { useAffinityStore } from './domains/affinity'
import { useAnimationStore } from './domains/animation'
import { useBeatSyncStore } from './domains/beat-sync'
import { useCardStore } from './domains/card'
import { useCharacterStore } from './domains/character'
import { useChatConfigStore } from './domains/chat'
import { useConnectionStore } from './domains/connection'
import { useDesktopPreferencesStore } from './domains/desktop'
import { useHearingStore } from './domains/hearing'
import { useHomeAssistantStore } from './domains/home-assistant'
import { useImageStore } from './domains/image'
import { useMcpStore } from './domains/mcp'
import { useMemoryStore } from './domains/memory'
import { useModelsStore } from './domains/models'
import { useMusicStore } from './domains/music'
import { useProvidersStore } from './domains/providers'
import { useRecipesStore } from './domains/recipes'
import { useRemindersStore } from './domains/reminders'
import { useSessionsStore } from './domains/sessions'
import { useSpeechStore } from './domains/speech'
import { useStickersStore } from './domains/stickers'
import { useToolCardsStore } from './domains/tool-cards'
import { useUiStore } from './domains/ui'
import { useVisionStore } from './domains/vision'
import { useWeatherStore } from './domains/weather'
import { useWebSearchStore } from './domains/web-search'

/** 在应用启动时调用一次。 */
export function enableCrossWindowSync(): void {
  syncAcrossWindows('providers', useProvidersStore)
  syncAcrossWindows('models', useModelsStore)
  syncAcrossWindows('chat', useChatConfigStore)
  syncAcrossWindows('character', useCharacterStore)
  syncAcrossWindows('sessions', useSessionsStore)
  syncAcrossWindows('memory', useMemoryStore)
  syncAcrossWindows('speech', useSpeechStore)
  syncAcrossWindows('mcp', useMcpStore)
  syncAcrossWindows('recipes', useRecipesStore)
  syncAcrossWindows('stickers', useStickersStore)
  syncAcrossWindows('image', useImageStore)
  syncAcrossWindows('ui', useUiStore)
  syncAcrossWindows('card', useCardStore)
  syncAcrossWindows('hearing', useHearingStore)
  syncAcrossWindows('vision', useVisionStore)
  syncAcrossWindows('webSearch', useWebSearchStore)
  syncAcrossWindows('toolCards', useToolCardsStore)
  syncAcrossWindows('connection', useConnectionStore)
  syncAcrossWindows('desktop', useDesktopPreferencesStore)
  syncAcrossWindows('animation', useAnimationStore)
  syncAcrossWindows('beatSync', useBeatSyncStore)
  syncAcrossWindows('homeAssistant', useHomeAssistantStore)
  syncAcrossWindows('affinity', useAffinityStore)
  syncAcrossWindows('weather', useWeatherStore)
  syncAcrossWindows('ambient', useAmbientStore)
  syncAcrossWindows('music', useMusicStore)
  syncAcrossWindows('reminders', useRemindersStore)
}

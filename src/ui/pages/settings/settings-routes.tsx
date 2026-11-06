/**
 * 设置子路由表。
 *
 * 网页版和桌面版共用同一份设置页面，只在外层套用不同的布局：
 * 网页版有“返回舞台”，桌面版没有。
 */

import { Navigate, type RouteObject } from 'react-router'

import { AnimationPage } from './animation-page'
import { BeatSyncPage } from './beat-sync-page'
import { CardPage } from './card-page'
import { ConnectionPage } from './connection-page'
import { ConsciousnessPage } from './consciousness-page'
import { DataPage } from './data-page'
import { DesktopPage } from './desktop-page'
import { HearingPage } from './hearing-page'
import { HomeAssistantPage } from './home-assistant-page'
import { ImagePage } from './image-page'
import { McpPage } from './mcp-page'
import { MemoryLongTermPage } from './memory-long-term-page'
import { MemoryPage } from './memory-page'
import { MemoryShortTermPage } from './memory-short-term-page'
import { ModelsPage } from './models-page'
import { ModulesPage } from './modules-page'
import { PluginsPage } from './plugins-page'
import { ProviderDetailPage } from './provider-detail-page'
import { ProvidersPage } from './providers-page'
import { RecipesPage } from './recipes-page'
import { SettingsIndex } from './settings-index'
import { SpeechPage } from './speech-page'
import { StickersPage } from './stickers-page'
import { SystemPage } from './system-page'
import { ToolCardsPage } from './tool-cards-page'
import { TranscriberPage } from './transcriber-page'
import { VisionPage } from './vision-page'
import { VoiceprintPage } from './voiceprint-page'
import { WakeWordsPage } from './wake-words-page'
import { WebSearchPage } from './web-search-page'

export const settingsRoutes: RouteObject[] = [
  { index: true, element: <SettingsIndex /> },

  { path: 'card', element: <CardPage /> },
  { path: 'data', element: <DataPage /> },
  { path: 'models', element: <ModelsPage /> },
  { path: 'providers', element: <ProvidersPage /> },
  { path: 'providers/:providerId', element: <ProviderDetailPage /> },
  { path: 'modules', element: <ModulesPage /> },
  { path: 'modules/speech', element: <SpeechPage /> },
  { path: 'modules/hearing', element: <HearingPage /> },
  { path: 'modules/hearing/transcriber', element: <TranscriberPage /> },
  { path: 'modules/hearing/wake-words', element: <WakeWordsPage /> },
  { path: 'modules/hearing/voiceprint', element: <VoiceprintPage /> },
  { path: 'modules/consciousness', element: <ConsciousnessPage /> },
  { path: 'modules/vision', element: <VisionPage /> },
  { path: 'modules/stickers', element: <StickersPage /> },
  { path: 'modules/web-search', element: <WebSearchPage /> },
  { path: 'modules/artistry', element: <ImagePage /> },
  { path: 'modules/tool-cards', element: <ToolCardsPage /> },
  { path: 'modules/memory-short-term', element: <MemoryShortTermPage /> },
  { path: 'modules/memory-long-term', element: <MemoryLongTermPage /> },
  { path: 'modules/memory-long-term/memories', element: <MemoryPage /> },
  { path: 'modules/memory-long-term/recipes', element: <RecipesPage /> },
  { path: 'modules/home-assistant', element: <HomeAssistantPage /> },
  { path: 'modules/mcp', element: <McpPage /> },
  { path: 'modules/beat-sync', element: <BeatSyncPage /> },
  { path: 'animation', element: <AnimationPage /> },
  { path: 'connection', element: <ConnectionPage /> },
  { path: 'desktop', element: <DesktopPage /> },
  { path: 'plugins', element: <PluginsPage /> },
  { path: 'system', element: <SystemPage /> },

  // 旧路径保留重定向，避免书签失效。
  { path: 'overview', element: <Navigate to="/settings" replace /> },
  { path: 'character', element: <Navigate to="/settings/models" replace /> },
  { path: 'memory', element: <Navigate to="/settings/modules/memory-long-term/memories" replace /> },
  { path: 'mcp', element: <Navigate to="/settings/modules/mcp" replace /> },
  { path: 'speech', element: <Navigate to="/settings/modules/speech" replace /> },
  { path: 'recipes', element: <Navigate to="/settings/modules/memory-long-term/recipes" replace /> },
  { path: 'stickers', element: <Navigate to="/settings/modules/stickers" replace /> },
  { path: 'image', element: <Navigate to="/settings/modules/artistry" replace /> },
]

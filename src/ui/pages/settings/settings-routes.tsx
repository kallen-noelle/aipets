/**
 * 设置子路由表。
 *
 * 网页版和桌面版共用同一份设置页面，只在外层套用不同的布局：
 * 网页版有“返回舞台”，桌面版没有。
 *
 * 模块页路由由 modules-registry 派生，避免路径与页面在两处重复；非模块页
 * （模型、供应商、数据、插件等）与旧路径重定向仍在这里显式声明。
 */

import { createElement } from 'react'
import { Navigate, type RouteObject } from 'react-router'

import { CardPage } from './card-page'
import { ConnectionPage } from './connection-page'
import { DataPage } from './data-page'
import { DesktopPage } from './desktop-page'
import { MODULE_ENTRIES, moduleRoutePath } from './modules-registry'
import { ModelsPage } from './models-page'
import { ModulesPage } from './modules-page'
import { PluginsPage } from './plugins-page'
import { ProviderDetailPage } from './provider-detail-page'
import { ProvidersPage } from './providers-page'
import { SettingsIndex } from './settings-index'
import { SystemPage } from './system-page'

/** 模块页路由：路径与组件都来自注册表。 */
const moduleRoutes: RouteObject[] = MODULE_ENTRIES.map(entry => ({
  path: moduleRoutePath(entry.path),
  element: createElement(entry.element),
}))

export const settingsRoutes: RouteObject[] = [
  { index: true, element: <SettingsIndex /> },

  ...moduleRoutes,
  { path: 'modules', element: <ModulesPage /> },

  { path: 'card', element: <CardPage /> },
  { path: 'data', element: <DataPage /> },
  { path: 'models', element: <ModelsPage /> },
  { path: 'providers', element: <ProvidersPage /> },
  { path: 'providers/:providerId', element: <ProviderDetailPage /> },
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

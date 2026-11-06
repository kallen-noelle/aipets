/**
 * 网页版路由。
 *
 * 网页版保留舞台页、网页桌宠页和设置页；桌面窗口路由不在这个入口里。
 */

import { createHashRouter } from 'react-router'

import { SettingsLayout } from '@/ui/pages/settings/settings-layout'
import { settingsRoutes } from '@/ui/pages/settings/settings-routes'

import { WebChatPage } from './pages/chat-page'
import { WebPetPage } from './pages/pet-page'
import { StagePage } from './pages/stage-page'

export const webRouter = createHashRouter([
  { path: '/', element: <StagePage /> },
  { path: '/pet', element: <WebPetPage /> },
  { path: '/chat', element: <WebChatPage /> },
  {
    path: '/settings',
    element: <SettingsLayout />,
    children: settingsRoutes,
  },
  { path: '*', element: <WebPetPage /> },
])

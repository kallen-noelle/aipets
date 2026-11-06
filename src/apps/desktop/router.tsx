/**
 * 桌面版路由。
 *
 * 只有桌面窗口需要的页面：桌宠、聊天窗口、聊天悬浮球与设置。
 * 网页版的舞台页不进入这个入口。
 */

import { createHashRouter } from 'react-router'

import { SettingsLayout } from '@/ui/pages/settings/settings-layout'
import { settingsRoutes } from '@/ui/pages/settings/settings-routes'

import { ChatBallPage } from './pages/ball-page'
import { DesktopChatPage } from './pages/chat-window'
import { DesktopPetPage } from './pages/pet-page'

export const desktopRouter = createHashRouter([
  { path: '/pet', element: <DesktopPetPage /> },
  { path: '/chat', element: <DesktopChatPage /> },
  { path: '/ball', element: <ChatBallPage /> },
  {
    path: '/settings',
    // 桌面版没有舞台页，因此不显示“返回舞台”入口。
    element: <SettingsLayout showBackToStage={false} />,
    children: settingsRoutes,
  },
  { path: '*', element: <DesktopPetPage /> },
])

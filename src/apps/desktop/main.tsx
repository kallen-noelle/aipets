/**
 * 桌面版入口。
 *
 * 只加载桌面路由，并启用桌面实例同步；网页舞台与网页页面不进入这个入口。
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import '@/index.css'
import { bootstrap } from '@/app/bootstrap'
import { enableDesktopInstanceSync } from '@/desktop/instance-sync'

import { desktopRouter } from './router'

bootstrap()
// 桌面外壳里，每个启用的实例对应一个桌宠窗口。
enableDesktopInstanceSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={desktopRouter} />
  </StrictMode>,
)

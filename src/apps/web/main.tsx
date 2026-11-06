/**
 * 网页版入口。
 *
 * 只加载网页版路由；桌面窗口、悬浮球与 IPC 相关模块不会进入这个入口。
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import '@/index.css'
import { bootstrap } from '@/app/bootstrap'

import { webRouter } from './router'

bootstrap()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={webRouter} />
  </StrictMode>,
)

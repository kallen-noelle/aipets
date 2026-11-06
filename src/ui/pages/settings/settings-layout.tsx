/**
 * 设置窗口布局。
 *
 * 结构对齐原工程：max-w-6xl 居中容器，左侧品牌与导航，右侧内容区。
 * 小屏时导航横向滚动，大屏时纵向分组。
 *
 * 网页版带“返回舞台”入口；桌面版没有舞台页，因此传入 false 隐藏该入口。
 */

import { ArrowLeft } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'

import { SETTINGS_GROUPS } from './settings-registry'

const navItemClass = 'flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
const navItemActiveClass = 'bg-accent text-foreground'

export interface SettingsLayoutProps {
  /** 网页版显示“返回舞台”；桌面版没有舞台，设为 false。 */
  showBackToStage?: boolean
}

export function SettingsLayout({ showBackToStage = true }: SettingsLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium">aipets</span>
          </div>

          {showBackToStage
            ? (
                <div className="mb-4 flex items-center justify-between gap-2">
                  <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    返回舞台
                  </Link>
                </div>
              )
            : null}

          {/* 小屏横向滚动，大屏纵向分组。 */}
          <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {SETTINGS_GROUPS.map((group, index) => (
              <div key={group.title} className="flex shrink-0 gap-1 lg:flex-col lg:gap-0">
                <h2 className={`hidden px-3 py-1 text-xs text-muted-foreground lg:block ${index === 0 ? '' : 'mt-3'}`}>
                  {group.title}
                </h2>

                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      className={({ isActive }) =>
                        `${navItemClass} ${isActive ? navItemActiveClass : ''}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </NavLink>
                  )
                })}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/**
 * 设置首页：按分组展示顶层入口卡片。
 */

import { Link } from 'react-router'

import { SETTINGS_GROUPS } from './settings-registry'

export function SettingsIndex() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">设置</h1>
      <p className="mt-1 text-sm text-muted-foreground">配置按域拆分，每页只改自己那一份。</p>

      {SETTINGS_GROUPS.map(group => (
        <section key={group.title} className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">{group.title}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {group.items.map(item => (
              <Link
                key={item.id}
                to={item.path}
                className="rounded-xl border p-4 transition hover:border-primary/40 hover:bg-muted/40"
              >
                <span className="font-medium">{item.title}</span>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * 模块首页：按分类展示全部模块页。
 */

import { Link } from 'react-router'

import { MODULE_CATEGORIES, MODULE_ENTRIES } from './modules-registry'

export function ModulesPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">模块</h1>
      <p className="mt-1 text-sm text-muted-foreground">语音、意识、视觉、记忆与连接都在这里。</p>

      {MODULE_CATEGORIES.map(category => (
        <section key={category} className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">{category}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {MODULE_ENTRIES
              .filter(entry => entry.category === category)
              .map(entry => (
                <Link
                  key={entry.id}
                  to={entry.path}
                  className="rounded-xl border p-4 transition hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.title}</span>
                    {entry.ready
                      ? null
                      : <span className="text-xs text-muted-foreground">待复刻</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}

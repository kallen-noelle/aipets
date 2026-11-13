/**
 * 模块首页：按身体 / 能力两组展示机能模块，未归类的页面单独放在“其他”。
 */

import { Link } from 'react-router'

import { MODULE_ENTRIES, MODULE_GROUPS, type ModuleEntry } from './modules-registry'

function ModuleGrid({ items }: { items: ModuleEntry[] }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {items.map(entry => (
        <Link
          key={entry.id}
          to={entry.path}
          className="rounded-xl border p-4 transition hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{entry.title}</span>
            {entry.ready
              ? null
              : <span className="text-xs text-muted-foreground">未接入</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
        </Link>
      ))}
    </div>
  )
}

export function ModulesPage() {
  // 聊天模型、展示方式与连接不属于机能模块，不强行塞进两组里。
  const otherEntries = MODULE_ENTRIES.filter(entry => !entry.group)

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">模块</h1>
      <p className="mt-1 text-sm text-muted-foreground">身体模块常驻对话主链路，能力模块按需触发。</p>

      {MODULE_GROUPS.map((group) => {
        const items = MODULE_ENTRIES.filter(entry => entry.group === group.id)
        if (items.length === 0)
          return null

        return (
          <section key={group.id} className="mt-8">
            <h2 className="text-sm font-medium text-muted-foreground">{group.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
            <ModuleGrid items={items} />
          </section>
        )
      })}

      {otherEntries.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">其他</h2>
          <ModuleGrid items={otherEntries} />
        </section>
      )}
    </div>
  )
}

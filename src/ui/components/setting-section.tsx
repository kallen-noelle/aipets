/**
 * 设置页的通用区块：标题 + 说明 + 内容。
 *
 * 只做排版，不含任何配置逻辑。
 */

import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/ui/card'

export function SettingSection(props: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">{props.title}</CardTitle>
        {props.description
          ? <CardDescription>{props.description}</CardDescription>
          : null}
      </CardHeader>
      <CardContent className="space-y-4">{props.children}</CardContent>
    </Card>
  )
}

/** 一行设置：左侧标签与说明，右侧控件。 */
export function SettingRow(props: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="space-y-1">
        <div className="text-sm font-medium">{props.label}</div>
        {props.description
          ? <div className="text-xs text-muted-foreground">{props.description}</div>
          : null}
      </div>
      <div className="w-56 shrink-0">{props.children}</div>
    </div>
  )
}

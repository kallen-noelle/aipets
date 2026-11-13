/**
 * IPC 契约一致性测试。
 *
 * 通道名在 contract.cjs、preload.cjs、main.cjs 与渲染层 bridge.ts 之间是手写
 * 镜像的。这里用静态检查把它们绑在一起：任何一处改名或漏改都会让测试失败，
 * 而不是在运行时静默返回 undefined。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (relative: string): string => readFileSync(resolve(process.cwd(), relative), 'utf8')

/** 取出对象字面量的顶层键，按两空格缩进识别。 */
function topLevelKeys(block: string): string[] {
  return [...block.matchAll(/^ {2}(\w+):/gm)].map(match => match[1])
}

const contractSource = read('electron/shared/contract.cjs')
const preloadSource = read('electron/preload.cjs')
const mainSource = read('electron/main.cjs')
const bridgeSource = read('src/desktop/bridge.ts')

/** contract 里声明的通道键。 */
const channelBlock = contractSource.match(/const CHANNELS = \{([\s\S]*?)\n\}/)?.[1] ?? ''
const channelKeys = topLevelKeys(channelBlock)
/** 通道字符串本身，必须唯一。 */
const channelValues = [...channelBlock.matchAll(/^ {2}\w+: '([^']+)'/gm)].map(match => match[1])

/** preload 暴露给渲染层的方法与属性。 */
const preloadBlock = preloadSource.match(/exposeInMainWorld\('aipetsDesktop', \{([\s\S]*?)\n\}\)/)?.[1] ?? ''
const preloadKeys = topLevelKeys(preloadBlock)

/** bridge.ts 的 DesktopBridge 接口键。 */
const bridgeBlock = bridgeSource.match(/export interface DesktopBridge \{([\s\S]*?)\n\}/)?.[1] ?? ''
const bridgeKeys = topLevelKeys(bridgeBlock)

/** 源码里通过 CHANNELS.xxx 引用的键。 */
function referencedChannels(source: string): string[] {
  return [...source.matchAll(/CHANNELS\.(\w+)/g)].map(match => match[1])
}

describe('IPC 契约', () => {
  it('通道键与通道字符串都非空且不重复', () => {
    expect(channelKeys.length).toBeGreaterThan(0)
    expect(new Set(channelKeys).size).toBe(channelKeys.length)
    expect(new Set(channelValues).size).toBe(channelValues.length)
  })

  it('preload 引用的通道都存在于契约中', () => {
    const unknown = referencedChannels(preloadSource).filter(key => !channelKeys.includes(key))
    expect(unknown).toEqual([])
  })

  it('main 引用的通道都存在于契约中', () => {
    const unknown = referencedChannels(mainSource).filter(key => !channelKeys.includes(key))
    expect(unknown).toEqual([])
  })

  it('契约里的每个通道都至少被主进程或 preload 使用', () => {
    const used = new Set([...referencedChannels(preloadSource), ...referencedChannels(mainSource)])
    const unused = channelKeys.filter(key => !used.has(key))
    expect(unused).toEqual([])
  })

  it('bridge 接口与 preload 暴露的成员一致', () => {
    // 接口里声明了但 preload 没暴露，渲染层会拿到 undefined；
    // preload 暴露了但接口没声明，调用方无从得知。
    expect([...bridgeKeys].sort()).toEqual([...preloadKeys].sort())
  })
})

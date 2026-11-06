/**
 * 轮廓计算的测试。
 *
 * 只测纯函数，不依赖 DOM 与视频解码。
 */

import { describe, expect, it } from 'vitest'

import { alphaBounds, containRect, mapSampleBounds } from './hitbox'

/** 造一张指定透明度的 RGBA 画布，只在给定像素上写不透明像素。 */
function makePixels(width: number, height: number, points: Array<[number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of points) {
    const index = (y * width + x) * 4
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
    data[index + 3] = 255
  }

  return data
}

describe('alphaBounds', () => {
  it('返回不透明像素的包围盒', () => {
    const data = makePixels(4, 4, [[1, 1], [3, 3]])
    expect(alphaBounds(data, 4, 4)).toEqual({ x: 1, y: 1, width: 3, height: 3 })
  })

  it('全透明时返回 null', () => {
    expect(alphaBounds(makePixels(4, 4, []), 4, 4)).toBeNull()
  })

  it('忽略低于阈值的噪声像素', () => {
    const data = makePixels(4, 4, [[0, 0], [3, 3]])
    // 把角落像素改成半透明，低于阈值。
    data[(0 * 4 + 0) * 4 + 3] = 3
    expect(alphaBounds(data, 4, 4, 8)).toEqual({ x: 3, y: 3, width: 1, height: 1 })
  })
})

describe('containRect', () => {
  it('比例一致时铺满容器', () => {
    expect(containRect(640, 360, 640, 360)).toEqual({ x: 0, y: 0, width: 640, height: 360 })
  })

  it('容器更高时上下留白', () => {
    const rect = containRect(640, 640, 640, 360)
    expect(rect.width).toBe(640)
    expect(rect.height).toBe(360)
    expect(rect.y).toBe(140)
  })

  it('视频尺寸缺失时退回整块容器', () => {
    expect(containRect(320, 180, 0, 0)).toEqual({ x: 0, y: 0, width: 320, height: 180 })
  })
})

describe('mapSampleBounds', () => {
  it('把采样坐标放大到视频绘制区域', () => {
    const mapped = mapSampleBounds(
      { x: 10, y: 10, width: 20, height: 20 },
      160,
      90,
      { x: 0, y: 0, width: 640, height: 360 },
    )

    expect(mapped).toEqual({ x: 40, y: 40, width: 80, height: 80 })
  })

  it('保留绘制区域的偏移', () => {
    const mapped = mapSampleBounds(
      { x: 0, y: 0, width: 80, height: 45 },
      160,
      90,
      { x: 0, y: 140, width: 640, height: 360 },
    )

    expect(mapped.x).toBe(0)
    expect(mapped.y).toBe(140)
  })
})

/**
 * 轮廓计算的纯函数。
 *
 * 桌宠窗口默认覆盖整块矩形，但角色实际只占中间一部分。轮廓之外的点击必须
 * 穿透到桌面，所以要从视频帧的 alpha 通道算出可见像素的边界。
 *
 * 这些函数不碰 DOM，Vitest 直接测。
 */

/** 像素或 CSS 像素的矩形。 */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 扫描 RGBA 数据，返回 alpha 大于阈值的像素范围。
 *
 * 全透明时返回 null。阈值用于忽略编码噪声产生的极淡边缘。
 */
export function alphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 8,
): Bounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const rowStart = y * width
    for (let x = 0; x < width; x++) {
      if (data[(rowStart + x) * 4 + 3] > threshold) {
        if (x < minX)
          minX = x
        if (x > maxX)
          maxX = x
        if (y < minY)
          minY = y
        if (y > maxY)
          maxY = y
      }
    }
  }

  if (maxX < 0 || maxY < 0)
    return null

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  }
}

/**
 * 视频在容器里以 `object-fit: contain` 显示时的实际绘制区域。
 *
 * 窗口比例与视频不一致时会出现留白，留白不能算进角色区域。
 */
export function containRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): Bounds {
  if (videoWidth <= 0 || videoHeight <= 0)
    return { x: 0, y: 0, width: containerWidth, height: containerHeight }

  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight)
  const width = videoWidth * scale
  const height = videoHeight * scale
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

/**
 * 把采样坐标系里的轮廓映射到容器 CSS 坐标。
 *
 * 采样是低分辨率的，先换算到视频尺寸，再换算到容器上的实际绘制区域。
 */
export function mapSampleBounds(
  sample: Bounds,
  sampleWidth: number,
  sampleHeight: number,
  video: Bounds,
): Bounds {
  const scaleX = video.width / sampleWidth
  const scaleY = video.height / sampleHeight
  return {
    x: video.x + sample.x * scaleX,
    y: video.y + sample.y * scaleY,
    width: sample.width * scaleX,
    height: sample.height * scaleY,
  }
}

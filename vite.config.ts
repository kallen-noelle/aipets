import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** 角色素材目录。网页调试由下面的中间件读这里，桌面版打包时由 extraResources 复制。 */
const CHARACTERS_DIR = path.resolve(import.meta.dirname, 'assets/characters')

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.webm': 'video/webm',
  '.png': 'image/png',
}

/**
 * 把 `/characters/*` 映射到角色资源目录。
 *
 * 浏览器里没有自定义协议，网页版靠这条中间件读取与 Electron 完全相同的
 * 文件，资源只保留一份，打包体积不会翻倍。
 */
function characterAssets(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const requestPath = decodeURIComponent((req.url ?? '').split('?')[0])
    if (!requestPath.startsWith('/characters/')) {
      next()
      return
    }

    const target = path.resolve(CHARACTERS_DIR, requestPath.slice('/characters/'.length))
    // 阻断路径穿越，解析结果必须留在资源目录内。
    if (target !== CHARACTERS_DIR && !target.startsWith(`${CHARACTERS_DIR}${path.sep}`)) {
      res.writeHead(403).end()
      return
    }

    const stream = fs.createReadStream(target)
    stream.once('error', () => res.writeHead(404).end())
    stream.once('open', () => {
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(target)] ?? 'application/octet-stream',
        // 与 Electron 协议保持一致，允许渲染层读视频帧像素。
        'Access-Control-Allow-Origin': '*',
        // 资源文件不常改，让浏览器缓存，切换片段时不重复下载。
        'Cache-Control': 'no-cache',
      })
      stream.pipe(res)
    })
  }

  return {
    name: 'aipets-character-assets',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 打包后由 Electron 以 file:// 加载，必须用相对路径引用资源。
  base: './',
  plugins: [react(), tailwindcss(), characterAssets()],
  build: {
    // 两个独立入口：index.html 只属于网页版，desktop.html 只属于桌面版。
    outDir: 'out',
    rolldownOptions: {
      input: {
        index: path.resolve(import.meta.dirname, 'index.html'),
        desktop: path.resolve(import.meta.dirname, 'desktop.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})

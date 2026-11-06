/**
 * 本地资源服务。
 *
 * 打包后的渲染层从 file:// 打开，Chromium 不允许页面 fetch 自定义协议。
 * 主进程开一个只监听 127.0.0.1 的 HTTP 服务，把角色视频与索引作为普通
 * HTTP 资源提供给页面，并保留 Range 支持以便视频播放与循环。
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

/** 解析 `bytes=start-end`，无效范围返回 null。 */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!match)
    return null

  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Number(match[2]) : size - 1
  if (start >= size || end < start)
    return null

  return { start, end: Math.min(end, size - 1) }
}

/** 把请求路径解析到资源目录内，越界时返回 null。 */
function resolveTarget(root, pathname) {
  const prefix = '/characters/'
  if (!pathname.startsWith(prefix))
    return null

  const relative = decodeURIComponent(pathname.slice(prefix.length))
  const target = path.resolve(root, relative)
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    return null

  return target
}

async function handle(req, res, root) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const target = resolveTarget(root, url.pathname)
  if (!target) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
    res.end('not found')
    return
  }

  let stat
  try {
    stat = await fsp.stat(target)
  }
  catch {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
    res.end('not found')
    return
  }

  if (!stat.isFile()) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
    res.end('not found')
    return
  }

  const headers = {
    'Content-Type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  }

  const range = parseRange(req.headers.range, stat.size)
  if (!range) {
    res.writeHead(200, { ...headers, 'Content-Length': stat.size })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    fs.createReadStream(target).pipe(res)
    return
  }

  res.writeHead(206, {
    ...headers,
    'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
    'Content-Length': range.end - range.start + 1,
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(target, { start: range.start, end: range.end }).pipe(res)
}

/**
 * 启动资源服务，返回基地址与关闭方法。
 *
 * 端口交给系统分配，只监听本机回环地址，不暴露到局域网。
 */
function createResourceServer(root) {
  const server = http.createServer((req, res) => {
    void handle(req, res, root)
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        base: `http://127.0.0.1:${port}/characters`,
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

module.exports = { createResourceServer }

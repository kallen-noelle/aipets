/**
 * 主进程状态的小型 JSON 存储。
 *
 * 每个文件都带默认值，所以文件缺失或损坏不会弄垮窗口。写入做了防抖且不允许抛错，
 * 因为只读的用户目录也是一种合法部署。
 */

const fs = require('node:fs')
const path = require('node:path')

class JsonStore {
  constructor(file, defaults) {
    this.file = file
    this.defaults = defaults
    this.timer = null
    this.data = this.read()
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return { ...this.defaults }

      return { ...this.defaults, ...parsed }
    }
    catch {
      return { ...this.defaults }
    }
  }

  get() {
    return { ...this.data }
  }

  set(patch) {
    if (patch && typeof patch === 'object')
      this.data = { ...this.data, ...patch }

    this.schedule()
    return this.get()
  }

  schedule() {
    if (this.timer)
      clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 300)
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    }
    catch {
      // 只读的用户目录不能弄垮窗口。
    }
  }
}

module.exports = { JsonStore }

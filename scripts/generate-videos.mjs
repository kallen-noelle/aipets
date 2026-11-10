// Video queue runner for one character's action prompts.
//
// It reads action prompts from `<character>/动作提示词.md`, skips clips that
// already exist, then submits `agnes-video-2.5-flash` tasks. Each prompt
// section can declare its own duration:
//
//   ## 睡觉
//   ### start
//   **时长**：8 秒
//   ...
//
// A section without `###` sub-sections is treated as one single clip.
// The shared PNG is used as the default first and last frame.
//
// Run: AGNES_API_KEY=<你的密钥> node scripts/generate-videos.mjs
// PowerShell: $env:AGNES_API_KEY="<你的密钥>"; node scripts/generate-videos.mjs
// Character: AIPETS_CHARACTER_ID=main (default)
// Custom paths: AIPETS_CHARACTER_DIR / AIPETS_PROMPT_FILE / AIPETS_FRAME
// Stop: Ctrl+C. The state file lets a later run resume.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// 密钥只从环境变量读取，不写入仓库，避免再次泄露。
const API_KEY = process.env.AGNES_API_KEY
if (!API_KEY) {
  console.error('缺少 AGNES_API_KEY 环境变量。')
  console.error('PowerShell: $env:AGNES_API_KEY="<你的密钥>"; node scripts/generate-videos.mjs')
  process.exit(1)
}
const API_ORIGIN = 'https://api.agnes-ai.cn'
const BASE_URL = `${API_ORIGIN}/v1`
const VIDEO_MODEL = 'agnes-video-2.5-flash'
const IMAGE_MODEL = 'agnes-image-2.5-flash'

const TICK_MS = 90 * 1000
const RUN_MS = 10 * 60 * 60 * 1000
const MAX_IN_FLIGHT = 3
const MAX_ATTEMPTS = 2
const TASK_TIMEOUT_MS = 45 * 60 * 1000

const ASPECT_RATIO = '16:9'
const VIDEO_SIZE = '720P'

const scriptDir = import.meta.dirname
const rootDir = path.resolve(scriptDir, '..')
const characterId = process.env.AIPETS_CHARACTER_ID ?? 'main'
const CHARACTER_DIR = process.env.AIPETS_CHARACTER_DIR
  ? path.resolve(process.env.AIPETS_CHARACTER_DIR)
  : path.join(rootDir, 'assets', 'characters', characterId)
const ANIMATION_DIR = path.join(CHARACTER_DIR, 'animations')
const OUTPUT_DIR = path.join(CHARACTER_DIR, 'tmp')
const FRAME_PATH = process.env.AIPETS_FRAME ?? path.join(CHARACTER_DIR, 'memes', '第一帧-绿幕.png')
const PROMPT_FILE = process.env.AIPETS_PROMPT_FILE ?? path.join(CHARACTER_DIR, '动作提示词.md')
const STATE_PATH = path.join(OUTPUT_DIR, 'state.json')
const LOG_PATH = path.join(OUTPUT_DIR, 'runner.log')

const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000

const SKIP_SECTIONS = new Set([
  '角色基准描述',
  '通用前缀',
  '动作清单',
  '动作清单与用途',
  '缺失动作清单',
  '长动作说明',
  '时长与连续性总表',
  '生成顺序与帧链',
  '生成后登记流程',
])

mkdirSync(OUTPUT_DIR, { recursive: true })

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  appendFileSync(LOG_PATH, `${line}\n`)
}

function normalizeName(name) {
  return name
    .replace(/\.(webm|mp4)$/i, '')
    .replace(/^点击回应[-－—]?/, '')
    .replace(/\s+/g, '')
    .trim()
}

function splitSections(markdown) {
  const blocks = []
  let current = null
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line.startsWith('## ')) {
      if (current)
        blocks.push(current)
      current = { title: line.slice(3).trim(), lines: [] }
      continue
    }
    if (current)
      current.lines.push(line)
  }
  if (current)
    blocks.push(current)
  return blocks
}

function blockText(block) {
  return block.lines
    .filter(line => line.trim() !== '---')
    .map(line => line.replace(/^>\s?/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 把 `## 动作` 里的 `### start/loop/end` 拆成子段。 */
function splitSubSections(block) {
  const intro = []
  const subs = []
  let current = null

  for (const line of block.lines) {
    if (line.startsWith('### ')) {
      if (current)
        subs.push(current)
      current = { title: line.slice(4).trim(), lines: [] }
      continue
    }
    if (current)
      current.lines.push(line)
    else
      intro.push(line)
  }

  if (current)
    subs.push(current)

  return { intro, subs }
}

/** 从子段正文里读取“时长：X 秒”。 */
function parseSeconds(text, label) {
  const match = text.match(/(?:\*\*)?时长(?:\*\*)?\s*[：:]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)?/i)
  if (!match)
    throw new Error(`[${label}] 缺少“时长：X 秒”`)

  const seconds = Number(match[1])
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error(`[${label}] 时长必须是正数`)

  return seconds
}

function readPromptSources() {
  const actions = []
  if (!existsSync(PROMPT_FILE))
    return actions

  const blocks = splitSections(readFileSync(PROMPT_FILE, 'utf8'))
  const prefix = blocks.find(block => block.title === '通用前缀')
  const shared = prefix ? blockText(prefix) : ''

  for (const block of blocks) {
    const title = block.title
    if (SKIP_SECTIONS.has(title) || title.startsWith('附'))
      continue

    const actionName = title.replace(/^\d+\s+/, '').trim()
    if (!actionName)
      continue

    const { intro, subs } = splitSubSections(block)
    const introText = blockText({ title, lines: intro }).replace(/\*\*/g, '').trim()

    // 没有子段：整段就是一个普通短片。
    if (subs.length === 0) {
      const body = blockText(block).replace(/\*\*/g, '').trim()
      if (body.length < 30)
        continue

      actions.push({
        name: actionName,
        actionName,
        segment: '',
        intro: '',
        body,
        seconds: parseSeconds(body, actionName),
        shared,
      })
      continue
    }

    // 有子段：每个子段一张视频，文件名带 start/loop/end 后缀。
    for (const sub of subs) {
      const rawSegment = sub.title.trim()
      if (!/^(start|loop|end|开始|循环|结束)$/i.test(rawSegment))
        throw new Error(`[${actionName}] 未知子段：${rawSegment}（只支持 start / loop / end）`)

      const segment = /开始/.test(rawSegment)
        ? 'start'
        : /循环/.test(rawSegment)
          ? 'loop'
          : /结束/.test(rawSegment)
            ? 'end'
            : rawSegment.toLowerCase()

      const body = blockText(sub).replace(/\*\*/g, '').trim()
      if (body.length < 30)
        throw new Error(`[${actionName}/${segment}] 提示词太短`)

      actions.push({
        name: `${actionName}-${segment}`,
        actionName,
        segment,
        intro: introText,
        body,
        seconds: parseSeconds(body, `${actionName}/${segment}`),
        shared,
      })
    }
  }

  return actions
}

function existingClipNames() {
  const names = new Set()
  for (const entry of readdirSync(ANIMATION_DIR)) {
    if (/\.(webm|mp4)$/i.test(entry))
      names.add(normalizeName(entry))
  }
  return names
}

function buildJobs() {
  const actions = readPromptSources()
  const existing = existingClipNames()
  const jobs = []
  const seen = new Set()

  for (const action of actions) {
    const key = normalizeName(action.name)
    if (!key || existing.has(key) || seen.has(key))
      continue
    seen.add(key)

    const fileName = `${action.name.replace(/\s+/g, '')}.mp4`
    if (existsSync(path.join(OUTPUT_DIR, fileName)) && statSync(path.join(OUTPUT_DIR, fileName)).size > 1024)
      continue

    const prompt = [
      action.shared,
      `动作：${action.actionName}${action.segment ? `｜${action.segment}` : ''}`,
      action.intro,
      action.body,
      `输出规格：${action.seconds} 秒、${ASPECT_RATIO}、纯绿幕背景、无音轨、无字幕、无文字水印。`,
    ].filter(Boolean).join('\n\n')

    jobs.push({
      name: action.name,
      actionName: action.actionName,
      segment: action.segment,
      seconds: action.seconds,
      key,
      fileName,
      prompt,
      status: 'pending',
      attempts: 0,
      videoId: null,
      url: null,
      error: null,
      submittedAt: null,
      finishedAt: null,
    })
  }

  return jobs
}

function loadState() {
  if (!existsSync(STATE_PATH))
    return { startedAt: Date.now(), frameUrl: null, jobs: {} }
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  }
  catch {
    return { startedAt: Date.now(), frameUrl: null, jobs: {} }
  }
}

function saveState() {
  const snapshot = { startedAt, frameUrl: state.frameUrl, updatedAt: Date.now(), jobs: {} }
  for (const job of jobs) {
    snapshot.jobs[job.key] = {
      name: job.name,
      seconds: job.seconds,
      status: job.status,
      attempts: job.attempts,
      videoId: job.videoId,
      url: job.url,
      error: job.error,
      submittedAt: job.submittedAt,
      finishedAt: job.finishedAt,
      fileName: job.fileName,
    }
  }
  writeFileSync(STATE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
}

async function request(pathname, { method = 'GET', body, timeout = 120_000, absolute = false } = {}) {
  const url = absolute ? `${API_ORIGIN}${pathname}` : `${BASE_URL}${pathname}`
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    })
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    }
    catch {
      json = null
    }
    return { status: response.status, json, text }
  }
  catch (error) {
    return { status: 0, json: null, text: String(error) }
  }
}

function frameValue() {
  return state.frameUrl ?? frameDataUrl
}

// Uploads the shared PNG through the image model, so the video service can read
// a public URL. It runs only when a task reports an unreadable frame.
async function ensureHostedFrame() {
  if (state.frameUrl)
    return state.frameUrl

  log('首尾帧改用公开地址：先让图片模型转存参考图')
  const prompt = 'Return this exact character reference image unchanged. Keep the pose, the green background, the outfit, and the colors identical.'
  const payloads = [
    { model: IMAGE_MODEL, prompt, size: '1K', ratio: ASPECT_RATIO, image: [frameDataUrl], extra_body: { response_format: 'url' } },
    { model: IMAGE_MODEL, prompt, size: '1K', ratio: ASPECT_RATIO, extra_body: { image: [frameDataUrl], response_format: 'url' } },
  ]

  for (const payload of payloads) {
    const result = await request('/images/generations', { method: 'POST', body: payload, timeout: 180_000 })
    const url = result.json?.data?.[0]?.url
    if (url) {
      state.frameUrl = url
      saveState()
      log(`参考图已转存：${url}`)
      return url
    }
    log(`转存参考图失败：HTTP ${result.status} ${result.text.slice(0, 200)}`)
  }
  return frameDataUrl
}

function videoIdOf(json) {
  const data = json?.data ?? json ?? {}
  return data.video_id ?? data.videoId ?? data.id ?? data.task_id ?? json?.video_id ?? json?.id ?? null
}

// Returns true when the service accepted the task. A false result means stop
// submitting for now: the queue is full, the rate limit is hit, or the task failed.
async function submit(job) {
  const frame = frameValue()
  const payload = {
    model: VIDEO_MODEL,
    prompt: job.prompt,
    seconds: String(job.seconds),
    mode: 'keyframe',
    size: VIDEO_SIZE,
    aspect_ratio: ASPECT_RATIO,
    first_frame: frame,
    last_frame: frame,
  }

  const result = await request('/videos', { method: 'POST', body: payload, timeout: 180_000 })
  const code = result.json?.code ?? ''

  if (result.status === 200) {
    const videoId = videoIdOf(result.json)
    if (!videoId) {
      job.error = `建任务成功但没有视频 id：${result.text.slice(0, 160)}`
      job.status = 'failed'
      log(`[${job.name}] ${job.error}`)
      return false
    }
    job.status = 'running'
    job.videoId = videoId
    job.submittedAt = Date.now()
    job.error = null
    log(`[${job.name}] 已建任务 video_id=${videoId}（${job.seconds} 秒）`)
    return true
  }

  if (code === 'video_queue_full' || result.status === 503) {
    log(`[${job.name}] 队列已满，等下一轮：HTTP ${result.status} ${result.text.slice(0, 200)}`)
    return false
  }

  if (result.status === 429 || code === 'rate_limit_exceeded') {
    cooldownUntil = Date.now() + RATE_LIMIT_BACKOFF_MS
    log(`[${job.name}] 触发速率限制，暂停建任务 ${RATE_LIMIT_BACKOFF_MS / 60_000} 分钟`)
    return false
  }

  if (code === 'insufficient_user_quota' || result.status === 403) {
    throw new Error(`账号额度不足：${result.text.slice(0, 160)}`)
  }

  job.attempts += 1
  job.error = `HTTP ${result.status} ${result.text.slice(0, 300)}`
  job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
  if (/图片|image|frame|url|下载|fetch|media/i.test(job.error) && !state.frameUrl)
    job.needsHostedFrame = true
  log(`[${job.name}] 建任务失败（第 ${job.attempts} 次）：${job.error}`)
  return false
}

async function poll(job) {
  const query = `/agnesapi?video_id=${encodeURIComponent(job.videoId)}&model_name=${VIDEO_MODEL}`
  const result = await request(query, { timeout: 60_000, absolute: true })
  const json = result.json ?? {}
  const status = json.status ?? ''

  if (status === 'completed' && json.url) {
    const filePath = path.join(OUTPUT_DIR, job.fileName)
    try {
      const response = await fetch(json.url, { signal: AbortSignal.timeout(300_000) })
      if (!response.ok)
        throw new Error(`下载失败 HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      writeFileSync(filePath, buffer)
      job.status = 'done'
      job.url = json.url
      job.finishedAt = Date.now()
      job.error = null
      log(`[${job.name}] 完成，已保存 ${job.fileName}（${(buffer.length / 1024 / 1024).toFixed(2)} MB）`)
    }
    catch (error) {
      job.error = `结果下载失败：${String(error).slice(0, 200)}`
      job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
      log(`[${job.name}] ${job.error}`)
    }
    return
  }

  if (status === 'failed') {
    job.attempts += 1
    job.error = JSON.stringify(json.error ?? json).slice(0, 300)
    job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
    job.videoId = null
    if (/图片|image|frame|url|下载|fetch|media/i.test(job.error) && !state.frameUrl)
      job.needsHostedFrame = true
    log(`[${job.name}] 任务失败（第 ${job.attempts} 次）：${job.error}`)
    return
  }

  if (result.status === 404 && Date.now() - (job.submittedAt ?? Date.now()) > 5 * 60 * 1000) {
    job.attempts += 1
    job.error = '任务查询 404'
    job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
    log(`[${job.name}] 任务查询 404，稍后重建`)
    return
  }

  if (Date.now() - (job.submittedAt ?? Date.now()) > TASK_TIMEOUT_MS) {
    job.attempts += 1
    job.error = '任务超时'
    job.status = job.attempts < MAX_ATTEMPTS ? 'pending' : 'failed'
    log(`[${job.name}] 任务超时，稍后重建`)
    return
  }

  log(`[${job.name}] 生成中 ${status || 'pending'} ${json.progress ?? 0}%`)
}

const state = loadState()
if (!existsSync(PROMPT_FILE))
  throw new Error(`找不到提示词文件：${PROMPT_FILE}`)
if (!existsSync(FRAME_PATH))
  throw new Error(`找不到首尾帧参考图：${FRAME_PATH}`)
const jobs = buildJobs()
const frameDataUrl = `data:image/png;base64,${readFileSync(FRAME_PATH).toString('base64')}`

const saved = state.jobs ?? {}
for (const job of jobs) {
  const previous = saved[job.key]
  if (!previous)
    continue
  job.attempts = previous.attempts ?? 0
  if (previous.status === 'done' && existsSync(path.join(OUTPUT_DIR, job.fileName))) {
    job.status = 'done'
    job.url = previous.url ?? null
    job.finishedAt = previous.finishedAt ?? null
  }
  else if (previous.status === 'running' && previous.videoId) {
    job.status = 'running'
    job.videoId = previous.videoId
    job.submittedAt = previous.submittedAt ?? Date.now()
  }
}
state.frameUrl = state.frameUrl ?? null

let startedAt = state.startedAt ?? Date.now()
let deadline = startedAt + RUN_MS
let cooldownUntil = 0

function running() {
  return jobs.filter(job => job.status === 'running')
}

function pending() {
  return jobs.filter(job => job.status === 'pending')
}

function summary() {
  const done = jobs.filter(job => job.status === 'done').length
  const failed = jobs.filter(job => job.status === 'failed').length
  return `完成 ${done}/${jobs.length}，失败 ${failed}，待办 ${pending().length}，生成中 ${running().length}`
}

function resetStartedAtIfStale() {
  // A resumed run continues its ten hour window. A finished run starts fresh.
  if (Date.now() > deadline) {
    startedAt = Date.now()
    deadline = startedAt + RUN_MS
    state.startedAt = startedAt
  }
}

resetStartedAtIfStale()

log(`启动：${jobs.length} 个待生成分镜，目标目录 ${OUTPUT_DIR}`) 
log(`节奏 ${TICK_MS / 1000} 秒一次，并行 ${MAX_IN_FLIGHT}，时长 ${RUN_MS / 3_600_000} 小时`)
log(`提示词 ${PROMPT_FILE}`)
log(`首尾帧 ${FRAME_PATH}`)
log(`初始状态：${summary()}`)

for (const job of jobs)
  if (job.status === 'pending')
    log(`待生成：${job.name}（${job.seconds} 秒）-> ${job.fileName}`)

let stopping = false
process.on('SIGINT', () => {
  stopping = true
  log('收到中断信号，保存状态后退出')
  saveState()
  process.exit(0)
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (process.env.DRY_RUN === '1') {
  for (const job of jobs)
    log(`${job.status}\t${job.name}\t${job.seconds} 秒\t${job.fileName}\t提示词 ${job.prompt.length} 字`)
  saveState()
  process.exit(0)
}

while (!stopping && Date.now() < deadline) {
  const tickStart = Date.now()
  log(`--- ${new Date().toLocaleString('zh-CN')} ${summary()}`)

  for (const job of running())
    await poll(job)

  if (!running().length && !pending().length) {
    log('全部动作已结束，提前退出')
    saveState()
    break
  }

  // One attempt every TICK_MS. An accepted task leads straight to the next one.
  let fatal = false
  while (!stopping && Date.now() < deadline && running().length < MAX_IN_FLIGHT) {
    const next = Date.now() < cooldownUntil ? null : pending()[0]
    if (!next)
      break

    if (next.needsHostedFrame) {
      next.needsHostedFrame = false
      await ensureHostedFrame()
    }

    try {
      if (!await submit(next))
        break
    }
    catch (error) {
      log(String(error))
      fatal = true
      break
    }

    saveState()

    if (running().length < MAX_IN_FLIGHT && pending().length)
      await sleep(TICK_MS)
  }

  saveState()

  if (fatal) {
    log('额度不足或不可恢复错误，停止')
    break
  }

  const elapsed = Date.now() - tickStart
  const wait = Math.max(0, TICK_MS - elapsed)
  if (Date.now() + wait >= deadline)
    break
  await sleep(wait)
}

for (const job of running())
  await poll(job)

saveState()
log(`结束：${summary()}`)
log(`产物目录 ${OUTPUT_DIR}`)
